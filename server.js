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

// Funkcija za učitavanje balkan.json, cisco.json i ostalo.json
function ucitajSpecificnaPitanja() {
    pitanjaPodaci = {}; 
    const datotekeZaUcitavanje = ['balkan.json', 'cisco.json', 'ostalo.json'];

    datotekeZaUcitavanje.forEach(imeDatoteke => {
        const putanja = PITANJA_FOLDER + imeDatoteke;
        if (fs.existsSync(putanja)) {
            try {
                const sadrzaj = JSON.parse(fs.readFileSync(putanja, 'utf8'));
                pitanjaPodaci = { ...pitanjaPodaci, ...sadrzaj };
                console.log(`Učitano: ${imeDatoteke}`);
            } catch (error) {
                console.error(`Greška u JSON formatu (${imeDatoteke}):`, error);
            }
        }
    });
}

ucitajSpecificnaPitanja();

let trenutnaPitanja = {};
let tkoJePogodio = {};
let intervaliOdbrojavanja = {};
let povijestPitanja = {}; 

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

    const sad = Date.now();
    const triSata = 3 * 60 * 60 * 1000;

    if (!povijestPitanja[soba]) povijestPitanja[soba] = [];

    let dostupnaPitanja = kategorija.filter(p => {
        const staraPojava = povijestPitanja[soba].find(pov => pov.tekst === p.pitanje);
        return !staraPojava || (sad - staraPojava.vrijeme) > triSata;
    });

    if (dostupnaPitanja.length === 0) {
        povijestPitanja[soba] = [];
        dostupnaPitanja = kategorija;
    }

    const pitanje = dostupnaPitanja[Math.floor(Math.random() * dostupnaPitanja.length)];
    povijestPitanja[soba].push({ tekst: pitanje.pitanje, vrijeme: sad });
    
    trenutnaPitanja[soba] = pitanje;
    tkoJePogodio[soba] = [];
    
    io.to(soba).emit('obavijest', { poruka: `❓ PITANJE: ${pitanje.pitanje}`, tip: 'sustav' });

    let preostalo = 30;
    if (intervaliOdbrojavanja[soba]) clearInterval(intervaliOdbrojavanja[soba]);
    
    intervaliOdbrojavanja[soba] = setInterval(() => {
        preostalo--;
        if (preostalo === 15) io.to(soba).emit('obavijest', { poruka: `⏱️ Još 15 sekundi!`, tip: 'tajmer' });
        if (preostalo <= 10 && preostalo > 0) io.to(soba).emit('obavijest', { poruka: `⏳ ${preostalo}...`, tip: 'tajmer' });
        
        if (preostalo <= 0) {
            clearInterval(intervaliOdbrojavanja[soba]);
            io.to(soba).emit('obavijest', { poruka: `⌛ Isteklo vrijeme! Odgovor: ${pitanje.odgovor}`, tip: 'sustav' });
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
        if (!akt || !socket.ime || tkoJePogodio[soba].includes(socket.ime)) return;

        if (akt.odgovor.toLowerCase().trim() === data.tekst.toLowerCase().trim()) {
            clearInterval(intervaliOdbrojavanja[soba]);
            let iznos = tkoJePogodio[soba].length === 0 ? 7 : 5;
            korisnici[socket.ime].povijest.push({ iznos, kategorija: soba, vrijeme: Date.now() });
            tkoJePogodio[soba].push(socket.ime);
            spremiBazu();
            io.to(soba).emit('obavijest', { poruka: `✅ ${socket.ime} je POGODIO! (+${iznos}b)`, tip: 'tocno' });
            setTimeout(() => posaljiNovoPitanje(soba), 3000);
        } else {
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

server.listen(PORT, () => console.log(`Arena pokrenuta na portu ${PORT}`));