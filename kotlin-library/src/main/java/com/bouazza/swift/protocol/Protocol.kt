package com.bouazza.swift.protocol

import android.os.Handler
import android.os.Looper
import com.bouazza.swift.protocol.callbacks.ProtocolListener
import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.dispatcher.Dispatcher
import com.bouazza.swift.protocol.session.Session
import com.bouazza.swift.protocol.transport.TcpTransport
import com.bouazza.swift.protocol.transfer.TransferManager
import java.io.File
import java.io.IOException
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

/**
 * Main entry point and public API for the Swift peer-to-peer binary protocol.
 *
 * Usage:
 * ```kotlin
 * // Start listening symmetrically for incoming peer connection
 * Protocol.startListening(9999, myListener, "ServerPeer")
 *
 * // Or, connect symmetrically to a remote host
 * Protocol.connect("192.168.1.10", 9999, myListener, "ClientPeer")
 *
 * // Send messages or stream files symmetrically
 * Protocol.sendText("Hello P2P peer!")
 * Protocol.sendFile(File("/sdcard/image.png"))
 * ```
 */
object Protocol {
    private val executor = Executors.newCachedThreadPool()
    private val mainThreadHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var activeSession: Session? = null

    @Volatile
    private var serverSocket: ServerSocket? = null

    /**
     * Symmetrically starts a background listening socket to accept exactly one connection.
     * Decouples listener sockets from protocol logic immediately after connection.
     *
     * @param port Local port to bind.
     * @param listener Callback interface for protocol events.
     * @param nodeName Self-identification handle for handshakes.
     */
    fun startListening(port: Int, listener: ProtocolListener, nodeName: String) {
        if (activeSession != null) {
            postError(listener, IllegalStateException("Protocol session is already active."))
            return
        }

        executor.execute {
            try {
                val sSocket = ServerSocket(port).also { serverSocket = it }
                // Blocks until exactly one connection arrives
                val socket = sSocket.accept()
                
                // Immediately shut down server socket to free port, as we only need 1 peer
                sSocket.close()
                serverSocket = null

                initializePeer(socket, listener, nodeName)
            } catch (e: Exception) {
                if (activeSession == null) {
                    postError(listener, e)
                }
            }
        }
    }

    /**
     * Symmetrically connects to a remote host in the background.
     *
     * @param host Target IPv4 or IPv6 address.
     * @param port Target port.
     * @param listener Callback interface for protocol events.
     * @param nodeName Self-identification handle for handshakes.
     */
    fun connect(host: String, port: Int, listener: ProtocolListener, nodeName: String) {
        if (activeSession != null) {
            postError(listener, IllegalStateException("Protocol session is already active."))
            return
        }

        executor.execute {
            try {
                val transport = TcpTransport(host, port)
                initializePeer(transport, listener, nodeName)
            } catch (e: Exception) {
                postError(listener, e)
            }
        }
    }

    /**
     * Initiates peer connection wrap up around standard [Socket].
     */
    private fun initializePeer(socket: Socket, listener: ProtocolListener, nodeName: String) {
        val transport = TcpTransport(socket)
        initializePeer(transport, listener, nodeName)
    }

    /**
     * Configures full protocol suite on top of connected [TcpTransport].
     */
    private fun initializePeer(transport: TcpTransport, listener: ProtocolListener, nodeName: String) {
        val safeListener = MainThreadListenerProxy(listener, mainThreadHandler)
        val dispatcher = Dispatcher()
        val transferManager = TransferManager(safeListener)

        val connection = Connection(
            transport = transport,
            incomingPacketCallback = { packet ->
                activeSession?.let { dispatcher.dispatch(it.connection, packet) }
            },
            disconnectCallback = {
                activeSession = null
                safeListener.onDisconnected()
            }
        )

        activeSession = Session(connection, dispatcher, transferManager, safeListener, nodeName)
        
        // Notify connection established
        val remoteAddress = socketAddressOf(transport)
        safeListener.onConnected(remoteAddress.first, remoteAddress.second)
    }

    /**
     * Helper to resolve address details of connected socket safely.
     */
    private fun socketAddressOf(transport: TcpTransport): Pair<String, Int> {
        return try {
            val field = TcpTransport::class.java.getDeclaredField("socket")
            field.isAccessible = true
            val socket = field.get(transport) as Socket
            Pair(socket.inetAddress?.hostAddress ?: "unknown", socket.port)
        } catch (ignored: Exception) {
            Pair("unknown", 0)
        }
    }

    /**
     * Gracefully notifies the remote peer and disconnects.
     */
    fun disconnect() {
        val session = activeSession ?: return
        activeSession = null
        
        executor.execute {
            session.sendDisconnect()
        }

        try {
            serverSocket?.close()
            serverSocket = null
        } catch (ignored: Exception) {}
    }

    /**
     * Transmits a text chat message to the remote peer.
     *
     * @param senderName Your custom sender handle/alias.
     * @param text String text body.
     */
    fun sendText(senderName: String, text: String) {
        val session = activeSession ?: throw IllegalStateException("Not connected to any peer.")
        executor.execute {
            session.sendText(senderName, text)
        }
    }

    /**
     * Slices and streams a local binary file over the peer-to-peer session.
     *
     * @param file Target file to stream.
     * @param chunkSize Slicing dimension in bytes (default 4096).
     */
    fun sendFile(file: File, chunkSize: Int = 4096) {
        val session = activeSession ?: throw IllegalStateException("Not connected to any peer.")
        // Session handles background execution of transfer manager internally
        try {
            val transferManagerField = Session::class.java.getDeclaredField("transferManager")
            transferManagerField.isAccessible = true
            val transferManager = transferManagerField.get(session) as TransferManager
            transferManager.startOutgoingTransfer(session.connection, file, chunkSize)
        } catch (e: Exception) {
            throw IllegalStateException("Failed to coordinate file transmission: ${e.message}", e)
        }
    }

    private fun postError(listener: ProtocolListener, exception: Exception) {
        mainThreadHandler.post {
            listener.onError(exception)
        }
    }

    /**
     * Internal listener proxy to safely redirect callbacks onto Android's Main Thread (UI Thread).
     * Prevents common Android crashes resulting from editing views directly from socket threads.
     */
    private class MainThreadListenerProxy(
        private val delegate: ProtocolListener,
        private val handler: Handler
    ) : ProtocolListener {
        override fun onConnected(host: String, port: Int) {
            handler.post { delegate.onConnected(host, port) }
        }

        override fun onDisconnected() {
            handler.post { delegate.onDisconnected() }
        }

        override fun onHandshake(
            deviceName: String,
            appName: String,
            appVersion: String,
            platform: String,
            protocolVersion: Short,
            capabilities: String
        ) {
            handler.post {
                delegate.onHandshake(deviceName, appName, appVersion, platform, protocolVersion, capabilities)
            }
        }

        override fun onTextReceived(sender: String, text: String) {
            handler.post { delegate.onTextReceived(sender, text) }
        }

        override fun onFileStarted(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {
            handler.post { delegate.onFileStarted(transferId, fileName, fileSize, chunkSize) }
        }

        override fun onFileProgress(
            transferId: Int,
            bytesTransferred: Long,
            totalBytes: Long,
            percentage: Double,
            speedBytesPerSec: Long,
            estimatedRemainingSeconds: Long
        ) {
            handler.post {
                delegate.onFileProgress(
                    transferId,
                    bytesTransferred,
                    totalBytes,
                    percentage,
                    speedBytesPerSec,
                    estimatedRemainingSeconds
                )
            }
        }

        override fun onFileCompleted(transferId: Int, fileName: String, totalBytesReceived: Long, savePath: String) {
            handler.post { delegate.onFileCompleted(transferId, fileName, totalBytesReceived, savePath) }
        }

        override fun onFileCancelled(transferId: Int) {
            handler.post { delegate.onFileCancelled(transferId) }
        }

        override fun onError(exception: Exception) {
            handler.post { delegate.onError(exception) }
        }
    }
}
