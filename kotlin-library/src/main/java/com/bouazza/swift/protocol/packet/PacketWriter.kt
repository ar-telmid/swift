package com.bouazza.swift.protocol.packet

import com.bouazza.swift.protocol.transport.Transport
import java.io.IOException

/**
 * Handles thread-safe serialization and transmission of packets over the network transport layer.
 */
class PacketWriter(private val transport: Transport) {
    private val lock = Any()

    /**
     * Transmits a packet over the underlying transport.
     * Synchronized block ensures multiple threads do not interleave bytes on the stream.
     *
     * @param packet The [Packet] to send.
     * @throws IOException If transmission fails or transport is inactive.
     */
    @Throws(IOException::class)
    fun writePacket(packet: Packet) {
        synchronized(lock) {
            val data = packet.serialize()
            transport.write(data)
            transport.flush()
        }
    }
}
