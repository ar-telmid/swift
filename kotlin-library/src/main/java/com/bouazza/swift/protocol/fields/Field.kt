package com.bouazza.swift.protocol.fields

import com.bouazza.swift.protocol.constants.ProtocolConstants
import java.nio.ByteBuffer

/**
 * Represents a single Type-Length-Value (TLV) field in a packet's binary payload.
 *
 * Layout:
 * - Marker: 1 byte (0x00)
 * - Key: 1 byte (0-255)
 * - Length: 2 bytes unsigned big-endian (0-65535)
 * - Value: Variable byte array
 */
class Field(
    val key: Byte,
    val value: ByteArray
) {
    init {
        require(value.size <= 65535) {
            "Field value length (${value.size}) exceeds 16-bit unsigned maximum limit of 65535."
        }
    }

    /**
     * Serializes this single field into its continuous binary representation.
     *
     * @return Raw bytes of this field.
     */
    fun serialize(): ByteArray {
        val data = ByteArray(4 + value.size)
        val buffer = ByteBuffer.wrap(data)
        
        buffer.put(ProtocolConstants.FIELD_MARKER)
        buffer.put(key)
        buffer.putShort(value.size.toShort())
        buffer.put(value)
        
        return data
    }
}
