package com.bouazza.swift.protocol.dispatcher

import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.packet.Packet
import java.util.concurrent.ConcurrentHashMap

/**
 * Functional interface representing a single handler for a specific packet type.
 */
fun interface PacketHandler {
    /**
     * Executes custom processing for an incoming [Packet] on the given [Connection].
     *
     * @param connection The active connection.
     * @param packet The received packet.
     */
    fun handle(connection: Connection, packet: Packet)
}

/**
 * Event-driven router that maps incoming packet type bytes directly to their registered [PacketHandler]s.
 * Open for extensions: developers can register custom handlers for new packet types seamlessly.
 */
class Dispatcher {
    private val handlers = ConcurrentHashMap<Byte, PacketHandler>()

    /**
     * Associates a specific 1-byte packet type with a handler.
     * Allows seamless addition of new packet types without modifying core codebase.
     *
     * @param type 1-byte packet identifier.
     * @param handler Custom handler instance.
     */
    fun registerHandler(type: Byte, handler: PacketHandler) {
        handlers[type] = handler
    }

    /**
     * Unregisters the handler associated with the packet type.
     */
    fun unregisterHandler(type: Byte) {
        handlers.remove(type)
    }

    /**
     * Inspects the incoming packet's type and routes it to the designated handler.
     *
     * @param connection Connection that received this packet.
     * @param packet The incoming packet.
     */
    fun dispatch(connection: Connection, packet: Packet) {
        val handler = handlers[packet.type]
        if (handler != null) {
            try {
                handler.handle(connection, packet)
            } catch (e: Exception) {
                // Prevent packet handler errors from crashing the connection thread
                System.err.println("Error executing packet handler for type 0x${String.format("%02X", packet.type)}: ${e.message}")
            }
        } else {
            System.err.println("Warning: Received unhandled packet type 0x${String.format("%02X", packet.type)}")
        }
    }
}
