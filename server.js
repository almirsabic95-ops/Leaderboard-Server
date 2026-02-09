const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static('public')); 
app.use('/igre', express.static('games'));

// Učitavanje pitanja (Kreiraj pitanja.json u istom folderu)
let pitanjaPodaci = {};
if (fs.existsSync('./pitanja.json')) {
    pitanjaPodaci = JSON.parse(fs.readFileSync('./pitanja.json', 'utf8'));
}

// OSIGURAJ MAPE
const potrebneMape = ['./games', './data/statistika'];
potrebneMape.forEach(m => {
    if (!fs.existsSync(m)) fs.mkdirSync(m, { recursive: true });
});

// SOCKET.IO LOGIKA ZA KVIZ
io.on('connection', (socket) => {
    console.log('Korisnik spojen');

    socket.on('join_room', (soba) => {
        socket.join(soba);
    });

    socket.on('slanje_odgovora', (data) => {
        const { soba, ime, tekst } = data;
        const kategorijaPitanja = pitanjaPodaci[soba];

        if (kategorijaPitanja) {
            // Provjera točnosti (mala slova i micanje razmaka)
            const tocan = kategorijaPitanja.find(p => 
                p.odgovor.toLowerCase().trim() === tekst.toLowerCase().trim()
            );

            if (tocan) {
                io.to(soba).emit('obavijest', { 
                    poruka: `BRAVO ${ime}! "${tekst}" je točan odgovor! ✅`,
                    tip: 'tocno'
                });
            } else {
                io.to(soba).emit('nova_poruka', { ime, tekst });
            }
        }
    });
});

// API Rute koje si već imao
app.get('/api/kategorije-igara', (req, res) => {
    const mape = fs.readdirSync('./games', { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name);
    res.json(mape);
});

server.listen(PORT, () => console.log(`Rekvizit Server aktivan na portu ${PORT}`));