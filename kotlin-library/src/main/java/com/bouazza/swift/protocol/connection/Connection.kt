package com.bouazza.swift.protocol.connection

import com.bouazza.swift.protocol.packet.Packet
import com.bouazza.swift.protocol.packet.PacketReader
import com.bouazza.swift.protocol.packet.PacketWriter
import com.bouazza.swift.protocol.transport.Transport
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Manages an active network connection to a peer using an abstract [Transport] channel.
 * Implements simultaneous bi-directional packet stream transfer.
 * Decoupled from socket-establishment roles (listener vs. connector).
 */
class Connection(
    private val transport: Transport,
    private val incomingPacketCallback: (Packet) -> Unit,
    private val disconnectCallback: () -> Unit
) {
    private val packetReader = PacketReader(transport)
    private val packetWriter = PacketWriter(transport)
    private val isRunning = AtomicBoolean(true)
    private var readThread: Thread? = null

    init {
        // Run receiver loop in its own autonomous background thread
        readThread = Thread({ receiveLoop() }, "SwiftConnection-Receiver").apply {
            isDaemon = true
            start()
        }
    }

    /**
     * Sends a packet to the remote peer.
     * Thread-safe; multiple threads can call this simultaneously without packet corruption.
     *
     * @param packet Packet instance.
     * @throws IOException If transmission fails or the connection is inactive.
     */
    @Throws(IOException::class)
    fun sendPacket(packet: Packet) {
        if (!isActive) {
            throw IOException("Cannot send: connection is closed.")
        }
        packetWriter.writePacket(packet)
    }

    /**
     * Checks if the connection is active.
     */
    val isActive: Boolean
        get() = isRunning.get() && transport.isActive

    /**
     * Dedicated background receiver loop.
     * Continually blocks reading complete packets from the transport and hands them over to the callback.
     */
    private fun receiveLoop() {
        try {
            while (isRunning.get() && transport.isActive) {
                val packet = packetReader.readPacket()
                incomingPacketCallback(packet)
            }
        } catch (ignored: IOException) {
            // Socket closure or network disruption
        } catch (e: Exception) {
            // Log other unexpected failures
        } finally {
            close()
        }
    }

    /**
     * Closes the connection gracefully, shutting down input/output streams and the transport layer.
     */
    fun close() {
        if (!isRunning.compareAndSet(true, false)) {
            return
        }
        
        try {
            transport.close()
        } catch (ignored: Exception) {}

        disconnectCallback()
        
        // Interrupt the thread if needed
        readThread?.interrupt()
    }
}
