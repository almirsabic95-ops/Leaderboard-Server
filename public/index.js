<!DOCTYPE html>
<html lang="hr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rekvizit Kviz</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; background: #121212; color: white; display: flex; flex-direction: column; height: 100vh; }
        #login-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
        #quiz-screen { display: none; flex-direction: column; height: 100%; }
        #chat-window { flex: 1; overflow-y: auto; padding: 20px; border-bottom: 2px solid #333; }
        .msg { margin-bottom: 10px; padding: 8px 15px; border-radius: 20px; background: #2c2c2c; width: fit-content; }
        .system-msg { background: #1a472a; color: #4ade80; font-weight: bold; align-self: center; }
        #input-area { padding: 20px; display: flex; gap: 10px; background: #1e1e1e; }
        input { flex: 1; padding: 12px; border-radius: 25px; border: none; outline: none; }
        button { padding: 10px 20px; border-radius: 25px; border: none; background: #007bff; color: white; cursor: pointer; }
    </style>
</head>
<body>

    <div id="login-screen">
        <h1>REKVIZIT KVIZ</h1>
        <input type="text" id="username" placeholder="Unesi svoje ime...">
        <br>
        <select id="room-select">
            <option value="acl-liste">Soba: ACL Liste</option>
            <option value="python-coding">Soba: Python</option>
        </select>
        <br>
        <button onclick="prijaviSe()">Uđi u Kviz</button>
    </div>

    <div id="quiz-screen">
        <div id="chat-window"></div>
        <div id="input-area">
            <input type="text" id="answer-input" placeholder="Upiši odgovor i pritisni Enter...">
            <button onclick="posalji()">Pošalji</button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let korisnik = "";
        let trenutnaSoba = "";

        function prijaviSe() {
            korisnik = document.getElementById('username').value;
            trenutnaSoba = document.getElementById('room-select').value;
            if(!korisnik) return alert("Unesi ime!");
            
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('quiz-screen').style.display = 'flex';
            
            socket.emit('join_room', trenutnaSoba);
        }

        function posalji() {
            const tekst = document.getElementById('answer-input').value;
            if(!tekst) return;
            socket.emit('slanje_odgovora', { soba: trenutnaSoba, ime: korisnik, tekst: tekst });
            document.getElementById('answer-input').value = '';
        }

        socket.on('nova_poruka', (data) => {
            prikaziPoruku(`${data.ime}: ${data.tekst}`, 'msg');
        });

        socket.on('obavijest', (data) => {
            prikaziPoruku(data.poruka, 'msg system-msg');
        });

        function prikaziPoruku(tekst, klasa) {
            const div = document.createElement('div');
            div.className = klasa;
            div.innerText = tekst;
            document.getElementById('chat-window').appendChild(div);
            document.getElementById('chat-window').scrollTop = document.getElementById('chat-window').scrollHeight;
        }

        document.getElementById('answer-input').addEventListener('keypress', (e) => {
            if(e.key === 'Enter') posalji();
        });
    </script>
</body>
</html>