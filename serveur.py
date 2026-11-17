"""Petit serveur local pour jouer : python serveur.py  puis ouvrir http://localhost:8317
(Les modules JavaScript ne se chargent pas en ouvrant index.html directement avec file://.)"""
import http.server
import os
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8317
if os.environ.get("PORT", "").isdigit():  # port imposé par l'environnement (si 8317 est déjà pris)
    PORT = int(os.environ["PORT"])


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # toujours servir la dernière version des fichiers
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    import socket
    with socket.socket() as probe:  # déjà lancé (raccourci cliqué deux fois) ?
        probe.settimeout(0.5)
        running = probe.connect_ex(("127.0.0.1", PORT)) == 0
    try:
        if running:
            raise OSError
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:  # le jeu tourne déjà : on ouvre simplement le navigateur
        if "--ouvrir" in sys.argv:
            webbrowser.open(f"http://localhost:{PORT}")
        sys.exit(0)
    with srv:
        print(f"Ligue Boréale : http://localhost:{PORT}  (Ctrl+C pour arrêter)")
        if "--ouvrir" in sys.argv:
            webbrowser.open(f"http://localhost:{PORT}")
        srv.serve_forever()
