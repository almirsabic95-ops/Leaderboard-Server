const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public')); 
app.use('/igre', express.static('games'));

// Učitavanje pitanja
let pitanjaPodaci = {};
if (fs.existsSync('./pitanja.json')) {
    try {
        pitanjaPodaci = JSON.parse(fs.readFileSync('./pitanja.json', 'utf8'));
    } catch (err) {
        console.error("Greška pri čitanju pitanja.json:", err);
    }
}

// OSIGURAJ MAPE
const potrebneMape = ['./games', './data/statistika'];
potrebneMape.forEach(m => {
    if (!fs.existsSync(m)) fs.mkdirSync(m, { recursive: true });
});

// Praćenje trenutnog pitanja po sobama
let trenutnaPitanja = {};

function posaljiNovoPitanje(soba) {
    const kategorija = pitanjaPodaci[soba];
    if (kategorija && kategorija.length > 0) {
        const nasumicno = kategorija[Math.floor(Math.random() * kategorija.length)];
        trenutnaPitanja[soba] = nasumicno;
        io.to(soba).emit('obavijest', { 
            poruka: `NOVO PITANJE: ${nasumicno.pitanje}`,
            tip: 'sustav'
        });
    }
}

// SOCKET.IO LOGIKA
io.on('connection', (socket) => {
    console.log('Korisnik spojen');

    socket.on('join_room', (soba) => {
        socket.join(soba);
        // Ako već postoji aktivno pitanje, pošalji ga novom korisniku
        if (trenutnaPitanja[soba]) {
            socket.emit('obavijest', { poruka: `TRENUTNO PITANJE: ${trenutnaPitanja[soba].pitanje}` });
        } else {
            posaljiNovoPitanje(soba);
        }
    });

    socket.on('slanje_odgovora', (data) => {
        const { soba, ime, tekst } = data;
        const aktivnoPitanje = trenutnaPitanja[soba];

        if (aktivnoPitanje) {
            const ispravno = aktivnoPitanje.odgovor.toLowerCase().trim() === tekst.toLowerCase().trim();

            if (ispravno) {
                io.to(soba).emit('obavijest', { 
                    poruka: `✅ BRAVO ${ime}! "${tekst}" je točan odgovor!`,
                    tip: 'tocno'
                });
                // Odmah pošalji novo pitanje nakon točnog odgovora
                setTimeout(() => posaljiNovoPitanje(soba), 2000);
            } else {
                io.to(soba).emit('nova_poruka', { ime, tekst });
            }
        }
    });
});

app.get('/api/kategorije-igara', (req, res) => {
    const mape = fs.readdirSync('./games', { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name);
    res.json(mape);
});

server.listen(PORT, () => console.log(`Rekvizit Server aktivan na portu ${PORT}`));