import socket
from constants import DEFAULT_PORT
from dispatcher import PeerDispatcher
from connection import Connection
from peer import run_peer_repl

def main() -> None:
    # 1. Connect to the remote host
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    host = "127.0.0.1"
    
    try:
        print(f"🔌 [Client] Connecting to remote host {host}:{DEFAULT_PORT}...")
        sock.connect((host, DEFAULT_PORT))
        print(f"🟢 [Client] Connected successfully!")
        
        # 2. Create a Connection object (starts the receive_loop thread automatically)
        dispatcher = PeerDispatcher(node_name="ClientPeer")
        connection = Connection(sock, dispatcher)
        
        # Start the generic symmetric peer REPL shell
        run_peer_repl(connection, "ClientPeer")
        
    except Exception as e:
        print(f"❌ [Client] Failed to establish connection: {e}")
    finally:
        try:
            sock.close()
        except OSError:
            pass

if __name__ == "__main__":
    main()
