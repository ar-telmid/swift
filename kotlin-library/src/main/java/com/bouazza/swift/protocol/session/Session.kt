package com.bouazza.swift.protocol.session

import com.bouazza.swift.protocol.callbacks.ProtocolListener
import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.constants.ProtocolConstants
import com.bouazza.swift.protocol.dispatcher.Dispatcher
import com.bouazza.swift.protocol.fields.FieldReader
import com.bouazza.swift.protocol.fields.FieldWriter
import com.bouazza.swift.protocol.packet.Packet
import com.bouazza.swift.protocol.packet.PacketType
import com.bouazza.swift.protocol.transfer.TransferManager
import java.io.IOException

/**
 * High-level session coordinator wrapping the [Connection] with symmetric protocol logic.
 * Manages handshaking, heartbeat ping-pong, routing to [TransferManager], and callbacks to [ProtocolListener].
 */
class Session(
    val connection: Connection,
    private val dispatcher: Dispatcher,
    private val transferManager: TransferManager,
    private val listener: ProtocolListener,
    private val localNodeName: String
) {
    init {
        registerStandardHandlers()
        // Symmetrically trigger automatic handshake immediately after connection
        sendHandshake()
    }

    /**
     * Sends the local handshake metadata to identify this peer.
     */
    fun sendHandshake() {
        try {
            val payload = FieldWriter()
                .writeString(ProtocolConstants.KEY_DEVICE_NAME, localNodeName)
                .writeString(ProtocolConstants.KEY_APP_NAME, "SwiftP2PEngine")
                .writeString(ProtocolConstants.KEY_APP_VERSION, "1.0.0")
                .writeString(ProtocolConstants.KEY_PLATFORM, "Android API ${android.os.Build.VERSION.SDK_INT}")
                .writeShort(ProtocolConstants.KEY_PROTOCOL_VERSION, 1)
                .writeString(ProtocolConstants.KEY_CAPABILITIES, "TEXT,FILE_CHUNK_V1")
                .getBytes()

            connection.sendPacket(Packet(PacketType.HANDSHAKE, payload))
        } catch (e: Exception) {
            listener.onError(e)
        }
    }

    /**
     * Sends a plain text message over the session.
     */
    fun sendText(senderName: String, text: String) {
        try {
            val payload = FieldWriter()
                .writeString(ProtocolConstants.KEY_SENDER_NAME, senderName)
                .writeString(ProtocolConstants.KEY_TEXT_MESSAGE, text)
                .getBytes()

            connection.sendPacket(Packet(PacketType.TEXT, payload))
        } catch (e: Exception) {
            listener.onError(e)
        }
    }

    /**
     * Sends a keep-alive PING packet.
     */
    fun sendPing() {
        try {
            connection.sendPacket(Packet(PacketType.PING))
        } catch (e: Exception) {
            listener.onError(e)
        }
    }

    /**
     * Sends a grace DISCONNECT notification before breaking the socket.
     */
    fun sendDisconnect() {
        try {
            connection.sendPacket(Packet(PacketType.DISCONNECT))
        } catch (ignored: Exception) {}
        connection.close()
    }

    /**
     * Configures the [Dispatcher] with standard Swift protocol handlers.
     */
    private fun registerStandardHandlers() {
        // --- 1. HANDSHAKE ---
        dispatcher.registerHandler(PacketType.HANDSHAKE.value) { conn, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val deviceName = reader.getString(ProtocolConstants.KEY_DEVICE_NAME)
                val appName = reader.getString(ProtocolConstants.KEY_APP_NAME)
                val appVersion = reader.getString(ProtocolConstants.KEY_APP_VERSION)
                val platform = reader.getString(ProtocolConstants.KEY_PLATFORM)
                val protocolVersion = reader.getShort(ProtocolConstants.KEY_PROTOCOL_VERSION)
                val capabilities = reader.getString(ProtocolConstants.KEY_CAPABILITIES, "")

                // Notify developer immediately
                listener.onHandshake(deviceName, appName, appVersion, platform, protocolVersion, capabilities)

                // Symmetrically reply with HANDSHAKE_ACK
                val ackPayload = FieldWriter()
                    .writeBoolean(ProtocolConstants.KEY_HANDSHAKE_SUCCESS, true)
                    .writeString(ProtocolConstants.KEY_HANDSHAKE_MESSAGE, "Connection Approved by $localNodeName")
                    .getBytes()

                conn.sendPacket(Packet(PacketType.HANDSHAKE_ACK, ackPayload))
            } catch (e: Exception) {
                listener.onError(IOException("Malformed handshake package received: ${e.message}", e))
                conn.close()
            }
        }

        // --- 2. HANDSHAKE_ACK ---
        dispatcher.registerHandler(PacketType.HANDSHAKE_ACK.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val success = reader.getBoolean(ProtocolConstants.KEY_HANDSHAKE_SUCCESS)
                val message = reader.getString(ProtocolConstants.KEY_HANDSHAKE_MESSAGE)
                
                if (!success) {
                    listener.onError(IOException("Handshake was rejected by peer: $message"))
                    connection.close()
                }
            } catch (e: Exception) {
                listener.onError(IOException("Error parsing handshake acknowledgement: ${e.message}", e))
            }
        }

        // --- 3. TEXT ---
        dispatcher.registerHandler(PacketType.TEXT.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val sender = reader.getString(ProtocolConstants.KEY_SENDER_NAME)
                val text = reader.getString(ProtocolConstants.KEY_TEXT_MESSAGE)
                listener.onTextReceived(sender, text)
            } catch (e: Exception) {
                listener.onError(IOException("Error decoding incoming chat packet: ${e.message}", e))
            }
        }

        // --- 4. FILE_START ---
        dispatcher.registerHandler(PacketType.FILE_START.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val transferId = reader.getInt(ProtocolConstants.KEY_TRANSFER_ID)
                val fileName = reader.getString(ProtocolConstants.KEY_FILE_NAME)
                val fileSize = reader.getLong(ProtocolConstants.KEY_FILE_SIZE)
                val chunkSize = reader.getInt(ProtocolConstants.KEY_CHUNK_SIZE)
                
                transferManager.handleIncomingStart(transferId, fileName, fileSize, chunkSize)
            } catch (e: Exception) {
                listener.onError(IOException("Failed to start incoming file transfer: ${e.message}", e))
            }
        }

        // --- 5. FILE_CHUNK ---
        dispatcher.registerHandler(PacketType.FILE_CHUNK.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val transferId = reader.getInt(ProtocolConstants.KEY_TRANSFER_ID)
                val chunkNumber = reader.getInt(ProtocolConstants.KEY_CHUNK_NUMBER)
                val data = reader.getBytes(ProtocolConstants.KEY_BINARY_DATA)
                
                transferManager.handleIncomingChunk(transferId, chunkNumber, data)
            } catch (e: Exception) {
                listener.onError(IOException("Error receiving file chunk payload: ${e.message}", e))
            }
        }

        // --- 6. FILE_END ---
        dispatcher.registerHandler(PacketType.FILE_END.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val transferId = reader.getInt(ProtocolConstants.KEY_TRANSFER_ID)
                
                transferManager.handleIncomingEnd(transferId)
            } catch (e: Exception) {
                listener.onError(IOException("Failed to complete incoming file transfer: ${e.message}", e))
            }
        }

        // --- 7. PING ---
        dispatcher.registerHandler(PacketType.PING.value) { conn, _ ->
            try {
                conn.sendPacket(Packet(PacketType.PONG))
            } catch (ignored: Exception) {}
        }

        // --- 8. PONG ---
        dispatcher.registerHandler(PacketType.PONG.value) { _, _ ->
            // Diagnostic hook or connection latency tracking if needed.
        }

        // --- 9. DISCONNECT ---
        dispatcher.registerHandler(PacketType.DISCONNECT.value) { conn, _ ->
            conn.close()
        }
    }
}
