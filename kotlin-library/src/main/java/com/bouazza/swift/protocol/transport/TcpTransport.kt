package com.bouazza.swift.protocol.transport

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Concrete TCP implementation of the [Transport] interface wrapping a standard [Socket].
 * Supports wrapping pre-connected server sockets or creating direct outgoing client socket connections.
 */
class TcpTransport : Transport {
    private val socket: Socket
    private val inputStream: BufferedInputStream
    private val outputStream: BufferedOutputStream
    
    @Volatile
    private var isClosed = false

    /**
     * Wrap an already accepted or connected [Socket].
     */
    constructor(socket: Socket) {
        this.socket = socket
        this.inputStream = BufferedInputStream(socket.getInputStream())
        this.outputStream = BufferedOutputStream(socket.getOutputStream())
    }

    /**
     * Create and connect a [Socket] to a remote host.
     */
    constructor(host: String, port: Int, connectionTimeoutMs: Int = 10000) {
        this.socket = Socket()
        this.socket.connect(InetSocketAddress(host, port), connectionTimeoutMs)
        this.inputStream = BufferedInputStream(socket.getInputStream())
        this.outputStream = BufferedOutputStream(socket.getOutputStream())
    }

    override val isActive: Boolean
        get() = !isClosed && socket.isConnected && !socket.isClosed && !socket.isInputShutdown && !socket.isOutputShutdown

    @Throws(IOException::class)
    override fun write(data: ByteArray) {
        if (!isActive) throw IOException("Cannot write: TCP transport is not active.")
        outputStream.write(data)
    }

    @Throws(IOException::class)
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (!isActive) throw IOException("Cannot read: TCP transport is not active.")
        
        var totalBytesRead = 0
        while (totalBytesRead < length) {
            val bytesRead = inputStream.read(buffer, offset + totalBytesRead, length - totalBytesRead)
            if (bytesRead == -1) {
                if (totalBytesRead == 0) return -1
                throw IOException("End of stream reached before reading expected length: $length")
            }
            totalBytesRead += bytesRead
        }
        return totalBytesRead
    }

    @Throws(IOException::class)
    override fun flush() {
        if (isActive) {
            outputStream.flush()
        }
    }

    override fun close() {
        if (isClosed) return
        isClosed = true
        
        try {
            // Unblocks reading threads blocking on read()
            socket.shutdownInput()
        } catch (ignored: Exception) {}

        try {
            socket.shutdownOutput()
        } catch (ignored: Exception) {}

        try {
            inputStream.close()
        } catch (ignored: Exception) {}

        try {
            outputStream.close()
        } catch (ignored: Exception) {}

        try {
            socket.close()
        } catch (ignored: Exception) {}
    }
}
