from packet import Packet
from packet_types import PacketType

class Dispatcher:
    """
    Routes incoming packets to type-specific callback handler methods.
    
    This is an abstract/base dispatcher class. Real server or client implementations
    subclass this to implement their specific application logic (e.g., printing chat
    messages or saving file chunks to disk).
    """

    def dispatch(self, connection, packet: Packet) -> None:
        """
        Dispatches a packet to its designated callback.
        
        :param connection: The active Connection instance that received this packet
        :param packet: The received Packet instance
        """
        try:
            pt = PacketType(packet.packet_type)
        except ValueError:
            print(f"[Dispatcher] Warning: Received unknown packet type: {packet.packet_type}")
            return

        if pt == PacketType.HANDSHAKE:
            self.on_handshake(connection, packet)
        elif pt == PacketType.HANDSHAKE_ACK:
            self.on_handshake_ack(connection, packet)
        elif pt == PacketType.TEXT:
            self.on_text(connection, packet)
        elif pt == PacketType.FILE_START:
            self.on_file_start(connection, packet)
        elif pt == PacketType.FILE_CHUNK:
            self.on_file_chunk(connection, packet)
        elif pt == PacketType.FILE_END:
            self.on_file_end(connection, packet)
        elif pt == PacketType.PING:
            self.on_ping(connection, packet)
        elif pt == PacketType.PONG:
            self.on_pong(connection, packet)
        elif pt == PacketType.DISCONNECT:
            self.on_disconnect(connection, packet)

    def on_handshake(self, connection, packet: Packet) -> None:
        """Called when a HANDSHAKE packet is received."""
        pass

    def on_handshake_ack(self, connection, packet: Packet) -> None:
        """Called when a HANDSHAKE_ACK packet is received."""
        pass

    def on_text(self, connection, packet: Packet) -> None:
        """Called when a TEXT packet is received."""
        pass

    def on_file_start(self, connection, packet: Packet) -> None:
        """Called when a FILE_START packet is received."""
        pass

    def on_file_chunk(self, connection, packet: Packet) -> None:
        """Called when a FILE_CHUNK packet is received."""
        pass

    def on_file_end(self, connection, packet: Packet) -> None:
        """Called when a FILE_END packet is received."""
        pass

    def on_ping(self, connection, packet: Packet) -> None:
        """Called when a PING packet is received."""
        pass

    def on_pong(self, connection, packet: Packet) -> None:
        """Called when a PONG packet is received."""
        pass

    def on_disconnect(self, connection, packet: Packet) -> None:
        """Called when a DISCONNECT packet is received."""
        pass
