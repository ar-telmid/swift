import socket
from constants import DEFAULT_PORT
from dispatcher import PeerDispatcher
from connection import Connection
from peer import run_peer_repl

def main() -> None:
    # 1. Open a listening socket
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    
    try:
        server_sock.bind(("0.0.0.0", DEFAULT_PORT))
        server_sock.listen(1)
        print(f"📡 [Server] Listening for exactly one peer connection on port {DEFAULT_PORT}...")
        
        # 2. Accept one incoming connection
        client_sock, addr = server_sock.accept()
        print(f"📥 [Server] Connection accepted from remote host: {addr[0]}:{addr[1]}")
        
        # Close listening socket since we only accept one connection
        server_sock.close()
        
        # 3. Create a Connection object (this automatically starts the receive_loop in a thread)
        dispatcher = PeerDispatcher(node_name="ServerPeer")
        connection = Connection(client_sock, dispatcher)
        
        # Start the generic symmetric peer REPL shell
        run_peer_repl(connection, "ServerPeer")
        
    except Exception as e:
        print(f"❌ [Server] Error: {e}")
    finally:
        try:
            server_sock.close()
        except OSError:
            pass

if __name__ == "__main__":
    main()
