const express = require('express');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 10000;

// Render fix: Služi fajlove iz glavnog foldera
app.use(express.static(__dirname));

const BODOVI_FILE = path.join(__dirname, 'bodovi.json');
const PITANJA_FOLDER = path.join(__dirname, 'pitanja/');

// Sigurno učitavanje korisnika
let korisnici = {};
try {
    if (fs.existsSync(BODOVI_FILE)) {
        const data = fs.readFileSync(BODOVI_FILE, 'utf8').trim();
        korisnici = data ? JSON.parse(data) : {};
    }
} catch (e) {
    korisnici = {};
}

let pitanjaPodaci = { kultura: [], sport: [], povijest: [], zemljopis: [], znanost: [], film: [], glazba: [], balkan: [], cisco: [] };
let trenutnaPitanja = {};
let tkoJePogodio = {};

// Učitavanje tvojih lokalnih pitanja (Balkan & Cisco)
function ucitajLokalnaPitanja() {
    ['balkan', 'cisco'].forEach(kat => {
        const p = path.join(PITANJA_FOLDER, `${kat}.json`);
        if (fs.existsSync(p)) {
            try {
                const d = JSON.parse(fs.readFileSync(p, 'utf8'));
                pitanjaPodaci[kat] = d[kat] || d.certifikati || [];
            } catch(e) { console.log("Greška u " + kat); }
        }
    });
}
ucitajLokalnaPitanja();

// API za ostale kategorije
async function prevedi(tekst) {
    try {
        const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(tekst)}&langpair=en|bs`);
        return res.data.responseData.translatedText;
    } catch { return tekst; }
}

async function dopuniPitanja() {
    for (let id in {9:1, 21:1, 23:1, 22:1, 17:1, 11:1, 12:1}) {
        try {
            const res = await axios.get(`https://opentdb.com/api.php?amount=5&category=${id}&type=multiple`);
            for (let p of res.data.results) {
                const q = await prevedi(p.question);
                const a = await prevedi(p.correct_answer);
                const kat = [ 'kultura','sport','povijest','zemljopis','znanost','film','glazba' ][Object.keys({9:1, 21:1, 23:1, 22:1, 17:1, 11:1, 12:1}).indexOf(id)];
                pitanjaPodaci[kat].push({ pitanje: q, odgovor: a });
            }
        } catch(e) {}
    }
}
dopuniPitanja();

io.on('connection', (socket) => {
    socket.on('prijava', (d) => {
        const ime = d.ime.trim();
        if (!korisnici[ime]) {
            if (!d.tajnaSifra) return socket.emit('prikazi_registraciju');
            korisnici[ime] = { lozinka: d.lozinka, tajnaSifra: d.tajnaSifra, povijest: [] };
            fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2));
        } else {
            if (korisnici[ime].lozinka !== d.lozinka) {
                return socket.emit('obavijest', { poruka: "❌ Pogrešna lozinka!", tip: 'netocno' });
            }
        }
        socket.ime = ime;
        socket.emit('uspjesna_prijava', { ime: ime, jeAdmin: ime === 'Blanco' });
    });

    socket.on('join_room', (soba) => {
        socket.leaveAll(); socket.join(soba); socket.trenutnaSoba = soba;
        if (!trenutnaPitanja[soba]) posaljiNovoPitanje(soba);
        else socket.emit('novo_pitanje', { pitanje: trenutnaPitanja[soba].pitanje });
    });

    socket.on('slanje_odgovora', (data) => {
        const soba = socket.trenutnaSoba; const akt = trenutnaPitanja[soba];
        if (!akt || !socket.ime || (tkoJePogodio[soba] && tkoJePogodio[soba].includes(socket.ime))) return;

        if (akt.odgovor.toLowerCase().trim() === data.tekst.toLowerCase().trim()) {
            if(!tkoJePogodio[soba]) tkoJePogodio[soba] = [];
            let bodovi = tkoJePogodio[soba].length === 0 ? 7 : 5;
            korisnici[socket.ime].povijest.push({ bodovi, kategorija: soba });
            tkoJePogodio[soba].push(socket.ime);
            io.to(soba).emit('obavijest', { poruka: `✅ ${socket.ime} je pogodio! (+${bodovi})`, tip: 'tocno' });
            fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2));
            posaljiNovoPitanje(soba);
        }
    });
});

function posaljiNovoPitanje(soba) {
    const lista = pitanjaPodaci[soba];
    if (lista && lista.length > 0) {
        trenutnaPitanja[soba] = lista[Math.floor(Math.random() * lista.length)];
        tkoJePogodio[soba] = [];
        io.to(soba).emit('novo_pitanje', { pitanje: trenutnaPitanja[soba].pitanje });
    }
}

server.listen(PORT, () => console.log(`Arena na portu ${PORT}`));