package com.bouazza.swift.protocol.packet

import java.nio.ByteBuffer

/**
 * Represents a discrete, fully formatted packet in the custom binary TCP protocol.
 *
 * Binary Frame Layout:
 * - Packet Type: 1 byte (mapped from [PacketType])
 * - Payload Length: 2 bytes unsigned (Big-Endian, maximum 65535 bytes)
 * - Payload: Variable length binary data
 */
class Packet(
    val type: Byte,
    val payload: ByteArray = ByteArray(0)
) {
    init {
        require(payload.size <= 65535) {
            "Packet payload size (${payload.size}) exceeds 16-bit unsigned integer maximum of 65535."
        }
    }

    constructor(packetType: PacketType, payload: ByteArray = ByteArray(0)) : this(packetType.value, payload)

    /**
     * Serializes this packet into its complete raw binary layout.
     *
     * @return Raw serialized packet byte array ready for socket transmission.
     */
    fun serialize(): ByteArray {
        val serialized = ByteArray(HEADER_SIZE + payload.size)
        val buffer = ByteBuffer.wrap(serialized)
        
        buffer.put(type)
        buffer.putShort(payload.size.toShort())
        buffer.put(payload)
        
        return serialized
    }

    override fun toString(): String {
        val resolvedType = PacketType.fromByte(type)?.name ?: "UNKNOWN($type)"
        return "Packet(type=$resolvedType, length=${payload.size})"
    }

    companion object {
        /**
         * Size of the fixed-length packet header in bytes (1B type + 2B length).
         */
        const val HEADER_SIZE = 3
    }
}
