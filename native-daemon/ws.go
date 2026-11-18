package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const wsMagicGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

type WSConn struct {
	conn   net.Conn
	rw     *bufio.ReadWriter
	writeM sync.Mutex
}

func upgradeWebSocket(w http.ResponseWriter, r *http.Request) (*WSConn, error) {
	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" {
		return nil, fmt.Errorf("missing Sec-WebSocket-Key")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		return nil, fmt.Errorf("webserver does not support hijacking")
	}
	conn, rw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}

	sum := sha1.Sum([]byte(key + wsMagicGUID))
	accept := base64.StdEncoding.EncodeToString(sum[:])

	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"

	if _, err := rw.WriteString(resp); err != nil {
		_ = conn.Close()
		return nil, err
	}
	if err := rw.Flush(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &WSConn{conn: conn, rw: rw}, nil
}

func (ws *WSConn) ReadTextFrame() (string, error) {
	for {
		header := make([]byte, 2)
		if _, err := io.ReadFull(ws.rw, header); err != nil {
			return "", err
		}
		opcode := header[0] & 0x0F
		masked := (header[1] & 0x80) != 0
		payloadLen := uint64(header[1] & 0x7F)

		if payloadLen == 126 {
			ext := make([]byte, 2)
			if _, err := io.ReadFull(ws.rw, ext); err != nil {
				return "", err
			}
			payloadLen = uint64(binary.BigEndian.Uint16(ext))
		} else if payloadLen == 127 {
			ext := make([]byte, 8)
			if _, err := io.ReadFull(ws.rw, ext); err != nil {
				return "", err
			}
			payloadLen = binary.BigEndian.Uint64(ext)
		}

		var maskKey [4]byte
		if masked {
			if _, err := io.ReadFull(ws.rw, maskKey[:]); err != nil {
				return "", err
			}
		}

		payload := make([]byte, payloadLen)
		if payloadLen > 0 {
			if _, err := io.ReadFull(ws.rw, payload); err != nil {
				return "", err
			}
		}
		if masked {
			for i := range payload {
				payload[i] ^= maskKey[i%4]
			}
		}

		switch opcode {
		case 0x8: // Close
			return "", io.EOF
		case 0x9: // Ping -> reply Pong
			_ = ws.writeFrame(0xA, payload)
		case 0x1, 0x2: // Text or Binary
			return string(payload), nil
		}
	}
}

func (ws *WSConn) WriteTextFrame(msg string) error {
	return ws.writeFrame(0x1, []byte(msg))
}

func (ws *WSConn) writeFrame(opcode byte, payload []byte) error {
	ws.writeM.Lock()
	defer ws.writeM.Unlock()

	// Bound writes so a stalled peer cannot block the PTY forwarding loop
	// forever (which would otherwise backpressure the whole session).
	_ = ws.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))

	var header []byte
	header = append(header, 0x80|opcode) // FIN + opcode
	length := len(payload)
	if length < 126 {
		header = append(header, byte(length))
	} else if length <= 65535 {
		header = append(header, 126, byte(length>>8), byte(length))
	} else {
		header = append(header, 127)
		var ext [8]byte
		binary.BigEndian.PutUint64(ext[:], uint64(length))
		header = append(header, ext[:]...)
	}

	if _, err := ws.rw.Write(header); err != nil {
		return err
	}
	if length > 0 {
		if _, err := ws.rw.Write(payload); err != nil {
			return err
		}
	}
	return ws.rw.Flush()
}

func (ws *WSConn) Close() error {
	return ws.conn.Close()
}
