// multiplayer.js — PeerJS WebRTC P2P Networking untuk SilangKata

(function () {
  'use strict';

  // Karakter aman tanpa huruf/angka yang membingungkan (tanpa 0, O, 1, I, L)
  const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const PEER_PREFIX = 'silangkata-';

  // Konfigurasi Google STUN Servers & Live TURN Relay Servers
  // TURN Relay diperlukan untuk menembus Symmetric NAT & CGNAT operator seluler/ISP remote
  const PEER_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:relay.metered.ca:80' },
      {
        urls: 'turn:relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:standard.relay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:standard.relay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:standard.relay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };

  class MultiplayerManager {
    constructor() {
      this.peer = null;
      this.isHost = false;
      this.playerNum = 1;
      this.maxPlayers = 2; // Default 2, dapat disetel hingga 6
      this.roomCode = null;
      this.isConnected = false;
      this.playerName = 'Pemain';
      this.isReady = false;
      this.hostPlayerNum = 1;
      this.roomSettings = null;
      this.isGameInProgress = false;
      this.connections = new Map(); // Untuk Host: peerId -> { conn, playerNum, name, isReady }
      this.guestConn = null; // Untuk Guest: data channel ke Host
      this._lastPlayerList = [];
      this.callbacks = {
        onReady: null,
        onPlayerListUpdate: null,
        onConnected: null,
        onMessage: null,
        onDisconnected: null,
        onError: null,
        onMidGameJoin: null
      };
      this.pingInterval = null;
      this.connTimeout = null;

      // Bersihkan koneksi saat window/tab ditutup atau direfresh
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => this.disconnect());
      }

      // Reconnect signaling jika tab aktif kembali setelah background/sleep
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && this.peer && !this.peer.destroyed && this.peer.disconnected) {
            console.log('[MP] Tab aktif kembali, memastikan signaling terhubung...');
            try {
              this.peer.reconnect();
            } catch (_) {}
          }
        });
      }
    }

    setPlayerName(name) {
      if (name && typeof name === 'string') {
        this.playerName = name.trim().slice(0, 15);
      }
    }

    setReady(isReady) {
      this.isReady = Boolean(isReady);
      if (this.isHost) {
        const currentPlayers = this.getPlayerList();
        this.broadcast({ type: 'player-update', players: currentPlayers });
        if (this.callbacks.onPlayerListUpdate) {
          this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
        }
      } else {
        this.send({
          type: 'ready-toggle',
          isReady: this.isReady
        });
      }
    }

    allGuestsReady() {
      const hNum = this.hostPlayerNum || 1;
      const guests = this.getPlayerList().filter(p => p.playerNum !== hNum);
      if (guests.length === 0) return false;
      return guests.every(p => p.isReady);
    }

    isCurrentHost() {
      return this.playerNum === (this.hostPlayerNum || 1);
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

    // Mendapatkan daftar pemain yang saat ini terhubung
    getPlayerList() {
      const hNum = this.hostPlayerNum || 1;
      if (this.isHost) {
        const list = [{
          playerNum: 1,
          isHost: (hNum === 1),
          name: this.playerName || (hNum === 1 ? 'Host' : 'Pemain 1'),
          isReady: hNum === 1 ? true : Boolean(this.isReady)
        }];
        for (const info of this.connections.values()) {
          const isTargetHost = (info.playerNum === hNum);
          list.push({
            playerNum: info.playerNum,
            isHost: isTargetHost,
            name: info.name || `Pemain ${info.playerNum}`,
            isReady: isTargetHost ? true : Boolean(info.isReady)
          });
        }
        list.sort((a, b) => a.playerNum - b.playerNum);
        return list;
      }
      return this._lastPlayerList && this._lastPlayerList.length > 0
        ? this._lastPlayerList
        : [{
            playerNum: this.playerNum,
            isHost: (this.playerNum === hNum),
            name: this.playerName || `Pemain ${this.playerNum}`,
            isReady: this.isReady
          }];
    }

    resetReadyStates() {
      this.isReady = false;
      if (!this.isHost) return;

      for (const info of this.connections.values()) {
        info.isReady = false;
      }
      const currentPlayers = this.getPlayerList();
      this.broadcast({ type: 'player-update', players: currentPlayers });
      if (this.callbacks.onPlayerListUpdate) {
        this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
      }
    }

    // Mengeluarkan pemain (Kick Player)
    kickPlayer(targetPlayerNum) {
      const targetNum = parseInt(targetPlayerNum, 10);
      if (!targetNum || targetNum === 1) return; // Pemilik room awal (network relay) tidak bisa di-kick

      if (this.isHost) {
        // Network Host mengeksekusi kick langsung
        for (const [peerId, info] of this.connections) {
          if (info.playerNum === targetNum) {
            console.log(`[MP Host] Mengeluarkan Pemain ${targetNum} (${info.name}) dari room.`);
            try {
              info.conn.send({
                type: 'kicked',
                reason: 'Kamu telah dikeluarkan dari room oleh Host.'
              });
              setTimeout(() => {
                try { info.conn.close(); } catch (_) {}
              }, 120);
            } catch (_) {}

            this.connections.delete(peerId);
            this.isConnected = this.connections.size > 0;
            const currentPlayers = this.getPlayerList();
            this.broadcast({ type: 'player-update', players: currentPlayers });
            if (this.callbacks.onPlayerListUpdate) {
              this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
            }
            if (this.callbacks.onMessage) {
              this.callbacks.onMessage({
                type: 'player-kicked-notice',
                playerNum: targetNum,
                name: info.name
              });
            }
            break;
          }
        }
      } else {
        // Promoted Host mengirim request kick ke network host
        this.send({
          type: 'request-kick',
          targetPlayerNum: targetNum
        });
      }
    }

    // Memindahkan status Host ke pemain lain
    transferHost(targetPlayerNum) {
      const targetNum = parseInt(targetPlayerNum, 10);
      if (!targetNum || targetNum === this.hostPlayerNum) return;

      if (this.isHost) {
        this.hostPlayerNum = targetNum;
        const currentPlayers = this.getPlayerList();
        this.broadcast({
          type: 'host-transferred',
          newHostPlayerNum: targetNum,
          players: currentPlayers
        });
        if (this.callbacks.onPlayerListUpdate) {
          this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
        }
        if (this.callbacks.onMessage) {
          this.callbacks.onMessage({
            type: 'host-transferred',
            newHostPlayerNum: targetNum
          });
        }
      } else {
        this.send({
          type: 'request-transfer-host',
          targetPlayerNum: targetNum
        });
      }
    }

    // Broadcast pesan ke seluruh guest terhubung (khusus Host)
    broadcast(payload, excludePeerId = null) {
      if (!this.isHost) return;
      for (const [peerId, info] of this.connections) {
        if (peerId !== excludePeerId && info.conn && info.conn.open) {
          try {
            info.conn.send(payload);
          } catch (err) {
            console.warn('[MP] Gagal broadcast pesan ke guest ' + peerId, err);
          }
        }
      }
    }

    // Mengirim pesan ke room
    send(payload) {
      if (!payload || typeof payload !== 'object') return;
      if (this.isHost) {
        if (payload.playerNum === undefined) payload.playerNum = 1;
        this.broadcast(payload);
      } else {
        if (payload.playerNum === undefined) payload.playerNum = this.playerNum;
        if (this.guestConn && this.guestConn.open) {
          try {
            this.guestConn.send(payload);
          } catch (err) {
            console.error('[MP] Gagal mengirim pesan WebRTC ke Host:', err);
          }
        }
      }
    }

    // Inisialisasi Host
    initHost(code, maxPlayers, onReady, onPlayerListUpdate, onMessage, onDisconnected, onError, onMidGameJoin) {
      this.disconnect();
      this.isHost = true;
      this.playerNum = 1;
      this.isReady = true;
      this.isGameInProgress = false;
      this.maxPlayers = Math.min(6, Math.max(2, parseInt(maxPlayers, 10) || 2));
      this.roomCode = code.toUpperCase().trim();
      this.connections.clear();
      this.callbacks = {
        onReady,
        onPlayerListUpdate,
        onMessage,
        onDisconnected,
        onError,
        onMidGameJoin
      };

      // Cek status internet perangkat
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (this.callbacks.onError) {
          this.callbacks.onError({
            type: 'offline',
            message: 'Perangkat sedang offline (tidak ada koneksi internet).'
          });
        }
        return;
      }

      const peerId = PEER_PREFIX + this.roomCode;
      console.log(`[MP] Inisialisasi Host (${peerId}), Kapasitas: ${this.maxPlayers} pemain`);

      try {
        this.peer = new window.Peer(peerId, {
          debug: 1,
          config: PEER_CONFIG
        });

        this.peer.on('open', (id) => {
          console.log('[MP] Host peer terbuka & siap di server:', id);
          if (this.callbacks.onReady) {
            this.callbacks.onReady(this.roomCode, this.maxPlayers);
          }
          if (this.callbacks.onPlayerListUpdate) {
            this.callbacks.onPlayerListUpdate(this.getPlayerList(), this.maxPlayers);
          }
        });

        this.peer.on('connection', (connection) => {
          console.log('[MP] Ada koneksi guest masuk:', connection.peer);

          // Cek kapasitas room
          if (this.connections.size >= (this.maxPlayers - 1)) {
            console.warn('[MP] Room penuh. Menolak koneksi:', connection.peer);
            connection.on('open', () => {
              try {
                connection.send({ type: 'room-full', message: 'Room sudah penuh.' });
                setTimeout(() => connection.close(), 400);
              } catch (_) {}
            });
            return;
          }

          // Cari nomor pemain terkecil yang masih kosong (2..6)
          const usedNums = new Set([1]);
          for (const info of this.connections.values()) {
            usedNums.add(info.playerNum);
          }
          let assignedNum = 2;
          while (assignedNum <= this.maxPlayers && usedNums.has(assignedNum)) {
            assignedNum++;
          }

          connection.on('open', () => {
            console.log(`[MP] Guest ${connection.peer} terhubung sebagai Pemain ${assignedNum}`);
            this.connections.set(connection.peer, {
              conn: connection,
              playerNum: assignedNum,
              name: `Pemain ${assignedNum}`,
              isReady: false
            });
            this.isConnected = true;

            const currentPlayers = this.getPlayerList();

            // Kirim pesan selamat datang ke guest yang baru join
            try {
              connection.send({
                type: 'welcome',
                playerNum: assignedNum,
                maxPlayers: this.maxPlayers,
                players: currentPlayers,
                hostPlayerNum: this.hostPlayerNum,
                isGameInProgress: this.isGameInProgress,
                roomSettings: this.roomSettings || null
              });
            } catch (_) {}

            // Broadcast info update pemain ke guest lainnya
            this.broadcast({
              type: 'player-update',
              players: currentPlayers
            }, connection.peer);

            // Update UI Host
            if (this.callbacks.onPlayerListUpdate) {
              this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
            }
          });

          connection.on('data', (data) => {
            if (!data || typeof data !== 'object') return;

            // Heartbeat
            if (data.type === 'ping') {
              try { connection.send({ type: 'pong' }); } catch (_) {}
              return;
            }
            if (data.type === 'pong') return;

            // Info profil nama saat guest baru masuk
            if (data.type === 'join-info') {
              const info = this.connections.get(connection.peer);
              if (info) {
                if (data.name) info.name = String(data.name).slice(0, 15);
                const currentPlayers = this.getPlayerList();
                this.broadcast({ type: 'player-update', players: currentPlayers });
                if (this.callbacks.onPlayerListUpdate) {
                  this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
                }
                // Jika game sudah berjalan, picu onMidGameJoin agar Host kirim syncGameState
                if (this.isGameInProgress && this.callbacks.onMidGameJoin) {
                  this.callbacks.onMidGameJoin(connection, assignedNum, info.name);
                  this.broadcast({
                    type: 'player-reconnected',
                    playerNum: assignedNum,
                    name: info.name
                  });
                }
              }
              return;
            }

            // Toggle Ready/Unready dari Guest
            if (data.type === 'ready-toggle') {
              const info = this.connections.get(connection.peer);
              if (info) {
                info.isReady = Boolean(data.isReady);
                const currentPlayers = this.getPlayerList();
                this.broadcast({ type: 'player-update', players: currentPlayers });
                if (this.callbacks.onPlayerListUpdate) {
                  this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
                }
              }
              return;
            }

            if (data.type === 'play-again-vote') {
              if (this.callbacks.onMessage) {
                this.callbacks.onMessage({ ...data, playerNum: assignedNum });
              }
              this.broadcast({ ...data, playerNum: assignedNum }, connection.peer);
              return;
            }

            // Request kick dari Promoted Host
            if (data.type === 'request-kick') {
              if (assignedNum === this.hostPlayerNum) {
                this.kickPlayer(data.targetPlayerNum);
              }
              return;
            }

            // Request transfer host dari Promoted Host
            if (data.type === 'request-transfer-host') {
              if (assignedNum === this.hostPlayerNum) {
                this.transferHost(data.targetPlayerNum);
              }
              return;
            }

            // Request start game dari Promoted Host
            if (data.type === 'request-start-game') {
              if (assignedNum === this.hostPlayerNum && this.callbacks.onMessage) {
                this.callbacks.onMessage({ type: 'request-start-game' });
              }
              return;
            }

            // Update room settings dari Promoted Host
            if (data.type === 'room-settings-update') {
              if (assignedNum === this.hostPlayerNum) {
                this.roomSettings = data;
              }
            }

            // Pastikan pesan membawa playerNum pengirim asli
            data.playerNum = assignedNum;

            // Teruskan ke game logic Host
            if (this.callbacks.onMessage) {
              this.callbacks.onMessage(data);
            }

            // Star Topology Relay: Teruskan ke seluruh guest lainnya
            this.broadcast(data, connection.peer);
          });

          const handleGuestLeave = () => {
            if (this.connections.has(connection.peer)) {
              const leavingInfo = this.connections.get(connection.peer);
              const leavingName = leavingInfo?.name || `Pemain ${assignedNum}`;
              console.log(`[MP] Guest Pemain ${assignedNum} (${leavingName}) terputus.`);
              this.connections.delete(connection.peer);
              this.isConnected = this.connections.size > 0;
              const currentPlayers = this.getPlayerList();

              if (this.callbacks.onPlayerListUpdate) {
                this.callbacks.onPlayerListUpdate(currentPlayers, this.maxPlayers);
              }

              this.broadcast({
                type: 'player-update',
                players: currentPlayers
              });

              this.broadcast({
                type: 'player-disconnected',
                playerNum: assignedNum,
                name: leavingName
              });

              if (this.callbacks.onMessage) {
                this.callbacks.onMessage({
                  type: 'player-disconnected',
                  playerNum: assignedNum,
                  name: leavingName
                });
              }
            }
          };

          connection.on('close', handleGuestLeave);
          connection.on('error', handleGuestLeave);
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
            this.initHost(newCode, this.maxPlayers, onReady, onPlayerListUpdate, onMessage, onDisconnected, onError);
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
    initGuest(code, onConnected, onPlayerListUpdate, onMessage, onDisconnected, onError) {
      this.disconnect();
      this.isHost = false;
      this.roomCode = code.toUpperCase().trim();
      this.callbacks = {
        onConnected,
        onPlayerListUpdate,
        onMessage,
        onDisconnected,
        onError
      };

      // Cek status internet perangkat sebelum mencoba
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (this.callbacks.onError) {
          this.callbacks.onError({
            type: 'offline',
            message: 'Perangkat sedang offline (tidak ada koneksi internet).'
          });
        }
        return;
      }

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
          this.guestConn = this.peer.connect(hostPeerId, {
            reliable: true
          });
          this._bindGuestConnectionEvents();
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

          // Retry jika host belum siap/ditemukan pada detik awal
          if (err && err.type === 'peer-unavailable' && guestRetryCount < maxRetries && !this.isConnected) {
            guestRetryCount++;
            console.warn(`[MP] Host belum terlihat di server (${guestRetryCount}/${maxRetries}), mencoba ulang...`);
            setTimeout(() => {
              if (!this.isConnected && this.peer && !this.peer.destroyed) {
                try {
                  this.guestConn = this.peer.connect(hostPeerId, { reliable: true });
                  this._bindGuestConnectionEvents();
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

    _bindGuestConnectionEvents() {
      if (!this.guestConn) return;

      // Pantau kegagalan ICE/Firewall tingkat RTCPeerConnection WebRTC
      try {
        const pc = this.guestConn.peerConnection;
        if (pc) {
          pc.addEventListener('iceconnectionstatechange', () => {
            const state = pc.iceConnectionState;
            console.log('[MP] Guest ICE Connection State:', state);
            if (state === 'failed' && !this.isConnected) {
              console.warn('[MP] ICE Connection State: failed (WebRTC terhalang firewall/NAT)');
              this._stopConnectionTimeout();
              if (this.callbacks.onError) {
                this.callbacks.onError({
                  type: 'ice-failed',
                  message: 'Koneksi terhalang firewall jaringan atau NAT ketat.'
                });
              }
              this.disconnect();
            }
          });
        }
      } catch (_) {}

      this.guestConn.on('open', () => {
        console.log('[MP] Koneksi guest ke host terbuka, mengirim profil nama...');
        try {
          this.guestConn.send({
            type: 'join-info',
            name: this.playerName || 'Pemain'
          });
        } catch (_) {}
      });

      this.guestConn.on('data', (data) => {
        if (!data || typeof data !== 'object') return;

        // Handshake selamat datang dari Host
        if (data.type === 'welcome') {
          console.log('[MP] Diterima handshake welcome dari Host:', data);
          this._stopConnectionTimeout();
          this.isConnected = true;
          this.playerNum = data.playerNum || 2;
          this.maxPlayers = data.maxPlayers || 2;
          this.hostPlayerNum = data.hostPlayerNum || 1;
          this._lastPlayerList = data.players || [];
          this._startHeartbeat();

          // Kirim ulang nama untuk memastikan sinkronisasi
          try {
            this.guestConn.send({
              type: 'join-info',
              name: this.playerName || `Pemain ${this.playerNum}`
            });
          } catch (_) {}

          if (this.callbacks.onConnected) {
            this.callbacks.onConnected(data);
          }
          if (this.callbacks.onPlayerListUpdate) {
            this.callbacks.onPlayerListUpdate(this._lastPlayerList, this.maxPlayers);
          }
          return;
        }

        // Dikeluarkan oleh Host (Kicked)
        if (data.type === 'kicked') {
          console.warn('[MP] Dikeluarkan dari room oleh Host:', data.reason);
          this.disconnect();
          if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data);
          }
          return;
        }

        // Pemindahan status Host (Host Transferred)
        if (data.type === 'host-transferred') {
          console.log(`[MP] Status Host dipindahkan ke Pemain ${data.newHostPlayerNum}`);
          this.hostPlayerNum = data.newHostPlayerNum;
          if (data.players) this._lastPlayerList = data.players;
          if (this.callbacks.onPlayerListUpdate) {
            this.callbacks.onPlayerListUpdate(this._lastPlayerList, this.maxPlayers);
          }
          if (this.callbacks.onMessage) {
            this.callbacks.onMessage(data);
          }
          return;
        }

        // Room penuh
        if (data.type === 'room-full') {
          console.warn('[MP] Host menolak: Room sudah penuh.');
          this._stopConnectionTimeout();
          if (this.callbacks.onError) {
            this.callbacks.onError({ type: 'room-full', message: 'Room sudah penuh (kapasitas maksimal tercapai)' });
          }
          this.disconnect();
          return;
        }

        // Update daftar pemain
        if (data.type === 'player-update') {
          this._lastPlayerList = data.players || [];
          if (this.callbacks.onPlayerListUpdate) {
            this.callbacks.onPlayerListUpdate(this._lastPlayerList, this.maxPlayers);
          }
          return;
        }

        // Heartbeat
        if (data.type === 'ping') {
          this.send({ type: 'pong' });
          return;
        }
        if (data.type === 'pong') return;

        // Pesan gameplay
        if (this.callbacks.onMessage) {
          this.callbacks.onMessage(data);
        }
      });

      this.guestConn.on('close', () => {
        console.warn('[MP] Guest connection closed');
        this._handleDisconnect();
      });

      this.guestConn.on('error', (err) => {
        console.error('[MP] Guest connection error:', err);
        const errMsg = (err && err.message) ? err.message : String(err || '');
        if (!this.isConnected && (errMsg.includes('Negotiation of connection') || errMsg.includes('ICE failed'))) {
          this._stopConnectionTimeout();
          if (this.callbacks.onError) {
            this.callbacks.onError({
              type: 'ice-failed',
              message: 'Negosiasi WebRTC gagal (jalur P2P diblokir jaringan).'
            });
          }
          this.disconnect();
          return;
        }
        this._handleDisconnect();
      });
    }

    _startConnectionTimeout(ms = 25000) {
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
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        this.callbacks.onError({
          type: isOffline ? 'offline' : 'peer-unavailable',
          message: isOffline
            ? 'Koneksi internet terputus saat mencoba menghubungkan room.'
            : 'Koneksi ke Host terputus sebelum handshake selesai.'
        });
      }
    }

    // Putuskan dan bersihkan semua koneksi
    disconnect() {
      this._stopHeartbeat();
      this._stopConnectionTimeout();
      this.isConnected = false;

      if (this.isHost) {
        for (const info of this.connections.values()) {
          try {
            if (typeof info.conn.removeAllListeners === 'function') info.conn.removeAllListeners();
            info.conn.close();
          } catch (_) {}
        }
        this.connections.clear();
      }

      if (this.guestConn) {
        try {
          if (typeof this.guestConn.removeAllListeners === 'function') this.guestConn.removeAllListeners();
          this.guestConn.close();
        } catch (_) {}
        this.guestConn = null;
      }

      if (this.peer) {
        try {
          if (typeof this.peer.removeAllListeners === 'function') this.peer.removeAllListeners();
          this.peer.destroy();
        } catch (_) {}
        this.peer = null;
      }

      this.isHost = false;
      this.playerNum = 1;
      this.hostPlayerNum = 1;
      this.maxPlayers = 2;
      this.roomCode = null;
      this._lastPlayerList = [];
    }
  }

  // Ekspos singleton ke global
  window.MP = new MultiplayerManager();
})();
