import socket
import threading
from typing import Optional
from packet import Packet
from dispatcher import Dispatcher

class Connection:
    """
    Manages a single persistent, thread-safe TCP socket connection.
    Identical for both peers, receiving an already connected socket.
    """

    def __init__(self, sock: socket.socket, dispatcher: Dispatcher):
        """
        Initialize a connection with an already connected socket and a dispatcher.
        
        :param sock: Already connected TCP socket (agnostic of accept() or connect())
        :param dispatcher: Packet routing dispatcher instance
        """
        self.sock: socket.socket = sock
        self.dispatcher: Dispatcher = dispatcher
        self._is_running: bool = True
        self._send_lock = threading.Lock()  # Prevent simultaneous writes from multiple threads
        
        # Start the background receiver thread executing the receive_loop
        self._read_thread = threading.Thread(
            target=self.receive_loop, 
            name="Connection-Receiver", 
            daemon=True
        )
        self._read_thread.start()

    def send_packet(self, packet: Packet) -> None:
        """
        Send a Packet over the TCP socket in a thread-safe manner.
        Can be safely called from any thread.
        
        :param packet: The Packet instance to send
        :raises ConnectionError: If the connection is closed or fails to send
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

    def receive_loop(self) -> None:
        """
        Continuous reading loop executed inside a dedicated background thread.
        Reads complete packets and dispatches them to the configured dispatcher.
        """
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
            # Inform dispatcher of disconnect via a mock DISCONNECT packet
            from packet_types import PacketType
            disconnect_packet = Packet(PacketType.DISCONNECT)
            self.dispatcher.dispatch(self, disconnect_packet)

    def close(self) -> None:
        """Close the socket and stop the background receiver thread."""
        if not self._is_running:
            return

        self._is_running = False
        try:
            # Shutdown socket to immediately break any blocked recv() calls
            self.sock.shutdown(socket.SHUT_RDWR)
        except socket.error:
            pass

        try:
            self.sock.close()
        except socket.error:
            pass

        # Join the reader thread if we are not calling close() from inside it
        if self._read_thread and threading.current_thread() != self._read_thread:
            self._read_thread.join(timeout=1.0)

    @property
    def is_active(self) -> bool:
        """Check if the connection is currently active."""
        return self._is_running
