package com.bouazza.swift.protocol.fields

import com.bouazza.swift.protocol.constants.ProtocolConstants
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

/**
 * Parses custom binary packet payloads, verifying boundaries and extracting fields.
 */
class FieldReader(payload: ByteArray) {
    private val fields = HashMap<Byte, ByteArray>()

    init {
        parse(payload)
    }

    @Throws(IOException::class)
    private fun parse(payload: ByteArray) {
        val buffer = ByteBuffer.wrap(payload)
        while (buffer.hasRemaining()) {
            if (buffer.remaining() < 4) {
                throw IOException("Malformed payload: Header truncated.")
            }

            val marker = buffer.get()
            if (marker != ProtocolConstants.FIELD_MARKER) {
                throw IOException(String.format("Marker validation failed. Expected 0x00, got 0x%02X", marker))
            }

            val key = buffer.get()
            val length = buffer.getShort().toInt() and 0xFFFF

            if (buffer.remaining() < length) {
                throw IOException("Malformed payload: Declared field length ($length) exceeds remaining buffer space.")
            }

            val valueBytes = ByteArray(length)
            buffer.get(valueBytes)
            fields[key] = valueBytes
        }
    }

    /**
     * Checks if the specified key exists in the parsed payload.
     */
    fun hasField(key: Byte): Boolean {
        return fields.containsKey(key)
    }

    /**
     * Retrieves a raw byte array field.
     *
     * @throws NoSuchElementException If the key is not found and no default is provided.
     */
    fun getBytes(key: Byte): ByteArray {
        return fields[key] ?: throw NoSuchElementException("Field with key 0x${String.format("%02X", key)} not found.")
    }

    fun getBytes(key: Byte, default: ByteArray): ByteArray {
        return fields[key] ?: default
    }

    /**
     * Retrieves and decodes a UTF-8 string field.
     */
    fun getString(key: Byte): String {
        return String(getBytes(key), StandardCharsets.UTF_8)
    }

    fun getString(key: Byte, default: String): String {
        val bytes = fields[key] ?: return default
        return String(bytes, StandardCharsets.UTF_8)
    }

    /**
     * Retrieves and decodes a 16-bit signed integer (Short).
     */
    fun getShort(key: Byte): Short {
        val bytes = getBytes(key)
        if (bytes.size != 2) throw IllegalArgumentException("Expected 2 bytes for Short, got ${bytes.size}.")
        return ByteBuffer.wrap(bytes).getShort()
    }

    fun getShort(key: Byte, default: Short): Short {
        val bytes = fields[key] ?: return default
        if (bytes.size != 2) return default
        return ByteBuffer.wrap(bytes).getShort()
    }

    /**
     * Retrieves and decodes a 32-bit signed integer (Int).
     */
    fun getInt(key: Byte): Int {
        val bytes = getBytes(key)
        if (bytes.size != 4) throw IllegalArgumentException("Expected 4 bytes for Int, got ${bytes.size}.")
        return ByteBuffer.wrap(bytes).getInt()
    }

    fun getInt(key: Byte, default: Int): Int {
        val bytes = fields[key] ?: return default
        if (bytes.size != 4) return default
        return ByteBuffer.wrap(bytes).getInt()
    }

    /**
     * Retrieves and decodes a 64-bit signed integer (Long).
     */
    fun getLong(key: Byte): Long {
        val bytes = getBytes(key)
        if (bytes.size != 8) throw IllegalArgumentException("Expected 8 bytes for Long, got ${bytes.size}.")
        return ByteBuffer.wrap(bytes).getLong()
    }

    fun getLong(key: Byte, default: Long): Long {
        val bytes = fields[key] ?: return default
        if (bytes.size != 8) return default
        return ByteBuffer.wrap(bytes).getLong()
    }

    /**
     * Retrieves and decodes a boolean field (Boolean).
     */
    fun getBoolean(key: Byte): Boolean {
        val bytes = getBytes(key)
        if (bytes.isEmpty()) throw IllegalArgumentException("Expected at least 1 byte for Boolean.")
        return bytes[0].toInt() != 0
    }

    fun getBoolean(key: Byte, default: Boolean): Boolean {
        val bytes = fields[key] ?: return default
        if (bytes.isEmpty()) return default
        return bytes[0].toInt() != 0
    }
}
