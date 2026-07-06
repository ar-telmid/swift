package com.bouazza.swift.protocol.packet

import com.bouazza.swift.protocol.transport.Transport
import java.io.IOException
import java.nio.ByteBuffer

/**
 * Handles synchronous reading and parsing of protocol packets from the network transport layer.
 */
class PacketReader(private val transport: Transport) {

    /**
     * Blocks until a single complete [Packet] is successfully read and parsed.
     *
     * @return The parsed Packet instance.
     * @throws IOException If the connection is broken or packets are malformed.
     */
    @Throws(IOException::class)
    fun readPacket(): Packet {
        // 1. Read fixed header (3 bytes)
        val headerBuffer = ByteArray(Packet.HEADER_SIZE)
        val headerReadResult = transport.read(headerBuffer, 0, Packet.HEADER_SIZE)
        if (headerReadResult == -1) {
            throw IOException("Socket closed while reading packet header.")
        }

        val headerWrap = ByteBuffer.wrap(headerBuffer)
        val type = headerWrap.get()
        val payloadLengthShort = headerWrap.getShort()
        
        // Convert to unsigned int (Kotlin handles via masking)
        val payloadLength = payloadLengthShort.toInt() and 0xFFFF

        // 2. Read variable payload
        val payloadBuffer = if (payloadLength > 0) {
            val buf = ByteArray(payloadLength)
            val payloadReadResult = transport.read(buf, 0, payloadLength)
            if (payloadReadResult == -1) {
                throw IOException("Socket closed while reading packet payload of length: $payloadLength")
            }
            buf
        } else {
            ByteArray(0)
        }

        return Packet(type, payloadBuffer)
    }
}
