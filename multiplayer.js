// multiplayer.js — PeerJS WebRTC P2P Networking untuk SilangKata

(function () {
  'use strict';

  // Karakter aman tanpa huruf/angka yang membingungkan (tanpa 0, O, 1, I, L)
  const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const PEER_PREFIX = 'silangkata-';

  // Konfigurasi Google STUN Servers terpercaya dan cepat
  const PEER_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  };

  class MultiplayerManager {
    constructor() {
      this.peer = null;
      this.conn = null;
      this.role = null; // 'across' (host) atau 'down' (guest)
      this.roomCode = null;
      this.isConnected = false;
      this.callbacks = {
        onReady: null,
        onConnected: null,
        onMessage: null,
        onDisconnected: null,
        onError: null
      };
      this.pingInterval = null;
      this.connTimeout = null;

      // Bersihkan koneksi saat window/tab ditutup atau direfresh
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => this.disconnect());
      }

      // Reconnect signaling jika tab aktif kembali setelah sempat background/sleep
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && this.peer && !this.peer.destroyed && this.peer.disconnected) {
            console.log('[MP] Tab aktif kembali, memastikan signaling host terhubung...');
            try {
              this.peer.reconnect();
            } catch (_) {}
          }
        });
      }
    }

    // Buat kode room 6 karakter
    generateRoomCode() {
      let code = '';
      for (let i = 0; i < 6; i++) {
        const idx = Math.floor(Math.random() * CODE_CHARS.length);
        code += CODE_CHARS[idx];
      }
      return code;
    }

    // Inisialisasi Host
    initHost(code, onReady, onConnected, onMessage, onDisconnected, onError) {
      this.disconnect();
      this.role = 'across'; // Host menguasai kata Mendatar
      this.roomCode = code.toUpperCase().trim();
      this.callbacks = { onReady, onConnected, onMessage, onDisconnected, onError };

      const peerId = PEER_PREFIX + this.roomCode;
      console.log('[MP] Inisialisasi Host dengan ID:', peerId);

      try {
        this.peer = new window.Peer(peerId, {
          debug: 1,
          config: PEER_CONFIG
        });

        this.peer.on('open', (id) => {
          console.log('[MP] Host peer terbuka & siap di server:', id);
          if (this.callbacks.onReady) {
            this.callbacks.onReady(this.roomCode);
          }
        });

        this.peer.on('connection', (connection) => {
          console.log('[MP] Guest menghubungi host, menyiapkan data channel...');
          this.conn = connection;
          this._bindConnectionEvents();
        });

        this.peer.on('disconnected', () => {
          console.warn('[MP] Host terputus dari signaling server, mencoba reconnect...');
          if (this.peer && !this.peer.destroyed) {
            try {
              this.peer.reconnect();
            } catch (e) {
              console.warn('[MP] Reconnect signaling error:', e);
            }
          }
        });

        this.peer.on('error', (err) => {
          console.error('[MP] Peer Host error:', err);
          if (err && err.type === 'unavailable-id') {
            console.warn('[MP] ID bentrok, membuat kode room baru...');
            const newCode = this.generateRoomCode();
            this.initHost(newCode, onReady, onConnected, onMessage, onDisconnected, onError);
            return;
          }
          if (this.callbacks.onError) {
            this.callbacks.onError(err);
          }
        });
      } catch (err) {
        console.error('[MP] Gagal inisialisasi Host Peer:', err);
        if (this.callbacks.onError) this.callbacks.onError(err);
      }
    }

    // Inisialisasi Guest
    initGuest(code, onConnected, onMessage, onDisconnected, onError) {
      this.disconnect();
      this.role = 'down'; // Guest menguasai kata Menurun
      this.roomCode = code.toUpperCase().trim();
      this.callbacks = { onConnected, onMessage, onDisconnected, onError };

      const hostPeerId = PEER_PREFIX + this.roomCode;
      console.log('[MP] Inisialisasi Guest untuk room:', hostPeerId);

      this._startConnectionTimeout(25000);
      let guestRetryCount = 0;
      const maxRetries = 3;

      try {
        this.peer = new window.Peer(null, {
          debug: 1,
          config: PEER_CONFIG
        });

        this.peer.on('open', (id) => {
          console.log('[MP] Guest peer siap (ID: ' + id + '). Menghubungi host:', hostPeerId);
          this.conn = this.peer.connect(hostPeerId, {
            reliable: true
          });
          this._bindConnectionEvents();
        });

        this.peer.on('disconnected', () => {
          if (!this.isConnected && this.peer && !this.peer.destroyed) {
            try {
              this.peer.reconnect();
            } catch (_) {}
          }
        });

        this.peer.on('error', (err) => {
          console.error('[MP] Peer Guest error:', err);

          // Retry jika host belum siap/ditemukan pada detik pertama
          if (err && err.type === 'peer-unavailable' && guestRetryCount < maxRetries && !this.isConnected) {
            guestRetryCount++;
            console.warn(`[MP] Host belum terlihat di server (percobaan ${guestRetryCount}/${maxRetries}), mencoba ulang...`);
            setTimeout(() => {
              if (!this.isConnected && this.peer && !this.peer.destroyed) {
                try {
                  this.conn = this.peer.connect(hostPeerId, { reliable: true });
                  this._bindConnectionEvents();
                } catch (retryErr) {
                  console.warn('[MP] Retry error:', retryErr);
                }
              }
            }, 1800);
            return;
          }

          this._stopConnectionTimeout();
          if (!this.isConnected) {
            if (this.callbacks.onError) this.callbacks.onError(err);
          } else {
            this._handleDisconnect();
          }
        });
      } catch (err) {
        this._stopConnectionTimeout();
        console.error('[MP] Gagal inisialisasi Guest Peer:', err);
        if (this.callbacks.onError) this.callbacks.onError(err);
      }
    }

    // Setup listener data channel
    _bindConnectionEvents() {
      if (!this.conn) return;

      this.conn.on('open', () => {
        console.log('[MP] Data Channel TERBUKA dan TERHUBUNG!');
        this._stopConnectionTimeout();
        this.isConnected = true;

        if (this.callbacks.onConnected) {
          this.callbacks.onConnected();
        }

        // Mulai heartbeat ping-pong
        this._startHeartbeat();
      });

      this.conn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;

        // Tangani pesan sistem internal
        if (data.type === 'ping') {
          this.send({ type: 'pong' });
          return;
        }
        if (data.type === 'pong') {
          return;
        }

        if (this.callbacks.onMessage) {
          this.callbacks.onMessage(data);
        }
      });

      this.conn.on('close', () => {
        console.warn('[MP] Data Channel terputus (close)');
        this._handleDisconnect();
      });

      this.conn.on('error', (err) => {
        console.error('[MP] Data Channel error:', err);
        this._handleDisconnect();
      });
    }

    // Mengirim pesan ke partner melalui WebRTC Data Channel
    send(payload) {
      if (this.conn && this.conn.open) {
        try {
          this.conn.send(payload);
        } catch (err) {
          console.error('[MP] Gagal mengirim pesan WebRTC:', err);
        }
      }
    }

    _startConnectionTimeout(ms = 20000) {
      this._stopConnectionTimeout();
      this.connTimeout = setTimeout(() => {
        if (!this.isConnected) {
          console.warn('[MP] Waktu tunggu koneksi room habis');
          if (this.callbacks.onError) {
            this.callbacks.onError({ type: 'timeout', message: 'Waktu tunggu koneksi habis' });
          }
          this.disconnect();
        }
      }, ms);
    }

    _stopConnectionTimeout() {
      if (this.connTimeout) {
        clearTimeout(this.connTimeout);
        this.connTimeout = null;
      }
    }

    _startHeartbeat() {
      this._stopHeartbeat();
      this.pingInterval = setInterval(() => {
        if (this.isConnected) {
          this.send({ type: 'ping' });
        }
      }, 5000);
    }

    _stopHeartbeat() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    }

    _handleDisconnect() {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this._stopHeartbeat();
      this._stopConnectionTimeout();

      if (wasConnected && this.callbacks.onDisconnected) {
        this.callbacks.onDisconnected();
      } else if (!wasConnected && this.callbacks.onError) {
        this.callbacks.onError({
          type: 'peer-unavailable',
          message: 'Koneksi ke host terputus sebelum berhasil terhubung'
        });
      }
    }

    // Putuskan dan bersihkan semua koneksi
    disconnect() {
      this._stopHeartbeat();
      this._stopConnectionTimeout();
      this.isConnected = false;

      if (this.conn) {
        try {
          if (typeof this.conn.removeAllListeners === 'function') {
            this.conn.removeAllListeners();
          }
          this.conn.close();
        } catch (_) {}
        this.conn = null;
      }

      if (this.peer) {
        try {
          if (typeof this.peer.removeAllListeners === 'function') {
            this.peer.removeAllListeners();
          }
          this.peer.destroy();
        } catch (_) {}
        this.peer = null;
      }

      this.role = null;
      this.roomCode = null;
    }
  }

  // Ekspos singleton ke global
  window.MP = new MultiplayerManager();
})();

