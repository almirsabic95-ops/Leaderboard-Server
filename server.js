const express = require('express');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const BODOVI_FILE = './bodovi.json';
const PITANJA_FOLDER = './pitanja/';

let korisnici = fs.existsSync(BODOVI_FILE) ? JSON.parse(fs.readFileSync(BODOVI_FILE, 'utf8')) : {};
let pitanjaPodaci = {};

// Dinamičko učitavanje pitanja iz mape
function ucitajSvaPitanja() {
    pitanjaPodaci = {}; 
    const datoteke = ['balkan.json', 'cisco.json', 'ostalo.json'];
    if (!fs.existsSync(PITANJA_FOLDER)) fs.mkdirSync(PITANJA_FOLDER);

    datoteke.forEach(file => {
        const putanja = PITANJA_FOLDER + file;
        if (fs.existsSync(putanja)) {
            const sadrzaj = JSON.parse(fs.readFileSync(putanja, 'utf8'));
            pitanjaPodaci = { ...pitanjaPodaci, ...sadrzaj };
        }
    });
}
ucitajSvaPitanja();

let trenutnaPitanja = {};
let tkoJePogodio = {};
let intervaliOdbrojavanja = {};
let povijestPitanja = {}; 

function spremiBazu() { fs.writeFileSync(BODOVI_FILE, JSON.stringify(korisnici, null, 2)); }

function dohvatiRangListu(kategorija, period = 'all') {
    const sad = Date.now();
    const okviri = { 'dan': 86400000, 'tjedan': 604800000, 'mjesec': 2592000000 };
    return Object.keys(korisnici).map(ime => {
        let bodovi = 0;
        (korisnici[ime].povijest || []).forEach(u => {
            if ((kategorija === 'global' || u.kategorija === kategorija) && (period === 'all' || (sad - u.vrijeme) < okviri[period])) bodovi += u.iznos;
        });
        return { ime, bodovi };
    }).sort((a, b) => b.bodovi - a.bodovi);
}

function posaljiNovoPitanje(soba) {
    const kategorija = pitanjaPodaci[soba];
    if (!kategorija || kategorija.length === 0) return;
    const sad = Date.now();
    if (!povijestPitanja[soba]) povijestPitanja[soba] = [];

    let dostupna = kategorija.filter(p => {
        const stara = povijestPitanja[soba].find(pov => pov.tekst === p.pitanje);
        return !stara || (sad - stara.vrijeme) > (3 * 60 * 60 * 1000);
    });

    if (dostupna.length === 0) { povijestPitanja[soba] = []; dostupna = kategorija; }
    const pitanje = dostupna[Math.floor(Math.random() * dostupna.length)];
    povijestPitanja[soba].push({ tekst: pitanje.pitanje, vrijeme: sad });
    
    trenutnaPitanja[soba] = pitanje;
    tkoJePogodio[soba] = [];
    io.to(soba).emit('obavijest', { poruka: `❓ PITANJE: ${pitanje.pitanje}`, tip: 'sustav' });

    let preostalo = 30;
    if (intervaliOdbrojavanja[soba]) clearInterval(intervaliOdbrojavanja[soba]);
    intervaliOdbrojavanja[soba] = setInterval(() => {
        preostalo--;
        if (preostalo === 15 || (preostalo <= 10 && preostalo > 0)) io.to(soba).emit('obavijest', { poruka: preostalo === 15 ? "⏱️ 15s!" : `⏳ ${preostalo}...`, tip: 'tajmer' });
        if (preostalo <= 0) {
            clearInterval(intervaliOdbrojavanja[soba]);
            io.to(soba).emit('obavijest', { poruka: `⌛ Isteklo! Odgovor: ${pitanje.odgovor}`, tip: 'sustav' });
            setTimeout(() => posaljiNovoPitanje(soba), 4000);
        }
    }, 1000);
}

io.on('connection', (socket) => {
    socket.on('prijava', (data) => {
        const { ime, lozinka, tajnaSifra } = data;
        if (!korisnici[ime]) {
            if (!tajnaSifra) return socket.emit('prikazi_registraciju');
            korisnici[ime] = { lozinka, tajnaSifra, povijest: [] };
            spremiBazu();
        } else if (korisnici[ime].lozinka !== lozinka) {
            return socket.emit('greska_prijava', 'Pogrešna lozinka!');
        }
        socket.ime = ime;
        socket.emit('uspjesna_prijava', { ime, jeAdmin: ime === 'Blanco' });
    });

    socket.on('join_room', (soba) => {
        socket.leaveAll(); socket.join(soba); socket.trenutnaSoba = soba;
        if (!trenutnaPitanja[soba]) posaljiNovoPitanje(soba);
        socket.emit('osvjezi_sidebar', dohvatiRangListu(soba).slice(0, 20));
    });

    socket.on('slanje_odgovora', (data) => {
        const soba = socket.trenutnaSoba; const akt = trenutnaPitanja[soba];
        if (!akt || !socket.ime || tkoJePogodio[soba].includes(socket.ime)) return;

        if (akt.odgovor.toLowerCase().trim() === data.tekst.toLowerCase().trim()) {
            clearInterval(intervaliOdbrojavanja[soba]);
            let iznos = tkoJePogodio[soba].length === 0 ? 7 : 5;
            korisnici[socket.ime].povijest.push({ iznos, kategorija: soba, vrijeme: Date.now() });
            tkoJePogodio[soba].push(socket.ime); spremiBazu();
            io.to(soba