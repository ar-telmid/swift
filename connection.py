import socket
import threading
from typing import Optional
from packet import Packet
from dispatcher import Dispatcher

class Connection:
    """
    Manages a single persistent, thread-safe TCP socket connection.
    
    Spawns a background thread that continuously blocks on the socket,
    reads packets, and dispatches them to a designated Dispatcher.
    """

    def __init__(self, sock: socket.socket, dispatcher: Dispatcher):
        """
        Initialize a connection with a socket and a packet dispatcher.
        
        :param sock: The active connected TCP socket
        :param dispatcher: The Dispatcher instance to handle incoming packets
        """
        self.sock: socket.socket = sock
        self.dispatcher: Dispatcher = dispatcher
        self._is_running: bool = False
        self._read_thread: Optional[threading.Thread] = None
        self._send_lock = threading.Lock()  # Prevent simultaneous writes from multiple threads

    def start(self) -> None:
        """Start the background packet receiver thread."""
        if self._is_running:
            return
            
        self._is_running = True
        self._read_thread = threading.Thread(target=self._receive_loop, name="Connection-Receiver", daemon=True)
        self._read_thread.start()

    def send_packet(self, packet: Packet) -> None:
        """
        Send a Packet over the TCP socket in a thread-safe manner.
        
        :param packet: The Packet instance to send
        :raises ConnectionError: If the socket is closed or fails to send
        """
        serialized = packet.serialize()
        with self._send_lock:
            if not self._is_running:
                raise ConnectionError("Cannot send: Connection is not active.")
            try:
                self.sock.sendall(serialized)
            except socket.error as e:
                self.close()
                raise ConnectionError(f"Failed to transmit packet: {e}")

    def close(self) -> None:
        """Close the socket and stop the background receiver thread."""
        if not self._is_running:
            return

        self._is_running = False
        try:
            # Shutdown socket to immediately wake up recv() blocks
            self.sock.shutdown(socket.SHUT_RDWR)
        except socket.error:
            pass

        try:
            self.sock.close()
        except socket.error:
            pass

        # Since daemon=True is set, we don't necessarily have to block joining,
        # but joining briefly is good practice.
        if self._read_thread and threading.current_thread() != self._read_thread:
            self._read_thread.join(timeout=1.0)

    def _receive_loop(self) -> None:
        """Continuous reading loop executed inside the daemon background thread."""
        try:
            while self._is_running:
                # Blocks until a complete packet is received
                packet = Packet.receive_from_socket(self.sock)
                # Dispatch the packet to our handler
                self.dispatcher.dispatch(self, packet)
        except ConnectionError:
            # Expected when socket is closed or disconnected
            pass
        except Exception as e:
            print(f"[Connection] Error in receiver loop: {e}")
        finally:
            self.close()
            # Inform dispatcher of disconnect
            # We construct a mock DISCONNECT packet to represent the socket closure
            from packet_types import PacketType
            disconnect_packet = Packet(PacketType.DISCONNECT)
            self.dispatcher.dispatch(self, disconnect_packet)

    @property
    def is_active(self) -> bool:
        """Check if the connection is currently running and active."""
        return self._is_running
