const express = require('express');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const BODOVI_FILE = './bodovi.json';
const PITANJA_FILE = './pitanja.json';

let korisnici = fs.existsSync(BODOVI_FILE) ? JSON.parse(fs.readFileSync(BODOVI_FILE, 'utf8')) : {};
let pitanjaPodaci = JSON.parse(fs.readFileSync(PITANJA_FILE, 'utf8'));

let trenutnaPitanja = {};
let tkoJePogodio = {};
let tajmeri = {};
let intervaliOdbrojavanja = {};

function spremiBazu() { fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2)); }

function dohvatiRangListu(kategorija, period = 'all') {
    const sad = Date.now();
    const vremenskiOkviri = { 'dan': 86400000, 'tjedan': 604800000, 'mjesec': 2592000000 };
    
    return Object.keys(korisnici).map(ime => {
        let bodovi = 0;
        (korisnici[ime].povijest || []).forEach(u => {
            if ((kategorija === 'global' || u.kategorija === kategorija) && (period === 'all' || (sad - u.vrijeme) < vremenskiOkviri[period])) {
                bodovi += u.iznos;
            }
        });
        return { ime, bodovi };
    }).sort((a, b) => b.bodovi - a.bodovi);
}

function posaljiNovoPitanje(soba) {
    const kategorija = pitanjaPodaci[soba];
    if (!kategorija || kategorija.length === 0) return;

    const pitanje = kategorija[Math.floor(Math.random() * kategorija.length)];
    trenutnaPitanja[soba] = pitanje;
    tkoJePogodio[soba] = [];
    
    io.to(soba).emit('obavijest', { poruka: `❓ PITANJE: ${pitanje.pitanje}`, tip: 'sustav' });

    // Odbrojavanje
    let preostalo = 30;
    if (intervaliOdbrojavanja[soba]) clearInterval(intervaliOdbrojavanja[soba]);
    
    intervaliOdbrojavanja[soba] = setInterval(() => {
        preostalo--;
        if (preostalo === 15) io.to(soba).emit('obavijest', { poruka: `⏱️ Još 15 sekundi!`, tip: 'tajmer' });
        if (preostalo <= 10 && preostalo > 0) io.to(soba).emit('obavijest', { poruka: `⏳ ${preostalo}...`, tip: 'tajmer' });
        
        if (preostalo <= 0) {
            clearInterval(intervaliOdbrojavanja[soba]);
            io.to(soba).emit('obavijest', { poruka: `⌛ Isteklo vrijeme! Odgovor je bio: ${pitanje.odgovor}`, tip: 'sustav' });
            setTimeout(() => posaljiNovoPitanje(soba), 4000);
        }
    }, 1000);
}

io.on('connection', (socket) => {
    socket.on('prijava', (data) => {
        const { ime, lozinka, tajnaSifra } = data;
        if (!korisnici[ime]) {
            korisnici[ime] = { lozinka, tajnaSifra, povijest: [] };
            spremiBazu();
        } else if (korisnici[ime].lozinka !== lozinka) {
            return socket.emit('greska_prijava', 'Pogrešna lozinka!');
        }
        socket.ime = ime;
        socket.emit('uspjesna_prijava', { ime, jeAdmin: ime === 'Blanco' });
    });

    socket.on('join_room', (soba) => {
        socket.leaveAll();
        socket.join(soba);
        socket.trenutnaSoba = soba;
        if (!trenutnaPitanja[soba]) posaljiNovoPitanje(soba);
        socket.emit('osvjezi_sidebar', dohvatiRangListu(soba).slice(0, 20));
    });

    socket.on('slanje_odgovora', (data) => {
        const soba = socket.trenutnaSoba;
        const akt = trenutnaPitanja[soba];
        if (!akt || tkoJePogodio[soba].includes(socket.ime)) return;

        if (akt.odgovor.toLowerCase().trim() === data.tekst.toLowerCase().trim()) {
            clearInterval(intervaliOdbrojavanja[soba]);
            let iznos = tkoJePogodio[soba].length === 0 ? 7 : 5;
            korisnici[socket.ime].povijest.push({ iznos, kategorija: soba, vrijeme: Date.now() });
            tkoJePogodio[soba].push(socket.ime);
            spremiBazu();
            io.to(soba).emit('obavijest', { poruka: `✅ ${socket.ime} je POGODIO! (+${iznos}b)`, tip: 'tocno' });
            setTimeout(() => posaljiNovoPitanje(soba), 3000);
        } else {
            // KAZNENI BODOVI: -2 za pogrešan odgovor
            korisnici[socket.ime].povijest.push({ iznos: -2, kategorija: soba, vrijeme: Date.now() });
            spremiBazu();
            socket.emit('obavijest', { poruka: `❌ Netočno! (-2 boda)`, tip: 'netocno' });
        }
        io.to(soba).emit('osvjezi_sidebar', dohvatiRangListu(soba).slice(0, 20));
    });

    socket.on('dohvati_glavnu_tablicu', (period) => {
        socket.emit('odgovor_glavna_tablica', dohvatiRangListu('global', period));
    });
});

server.listen(PORT, () => console.log(`Arena pokrenuta na ${PORT}`));