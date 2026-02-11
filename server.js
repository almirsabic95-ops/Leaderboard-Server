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
const PITANJA_FOLDER = './pitanja/'; // Mapa gdje se nalaze tvoji JSON dokumenti

let korisnici = fs.existsSync(BODOVI_FILE) ? JSON.parse(fs.readFileSync(BODOVI_FILE, 'utf8')) : {};
let pitanjaPodaci = {};

// Funkcija koja učitava samo balkan.json, cisco.json i ostalo.json
function ucitajSpecificnaPitanja() {
    pitanjaPodaci = {}; // Resetiranje baze u memoriji
    const datotekeZaUcitavanje = ['balkan.json', 'cisco.json', 'ostalo.json'];

    datotekeZaUcitavanje.forEach(imeDatoteke => {
        const putanja = PITANJA_FOLDER + imeDatoteke;
        if (fs.existsSync(putanja)) {
            try {
                const sadrzaj = JSON.parse(fs.readFileSync(putanja, 'utf8'));
                // Spajanje sadržaja u glavni objekt pitanjaPodaci
                pitanjaPodaci = { ...pitanjaPodaci, ...sadrzaj };
                console.log(`Učitano: ${imeDatoteke}`);
            } catch (error) {
                console.error(`Greška pri čitanju datoteke ${imeDatoteke}:`, error);
            }
        } else {
            console.warn(`Upozorenje: Datoteka ${imeDatoteke} nije pronađena u mapi ${PITANJA_FOLDER}`);
        }
    });
}

ucitajSpecificnaPitanja();

let trenutnaPitanja = {};
let tkoJePogodio = {};
let intervaliOdbrojavanja = {};
let povijestPitanja = {}; // Memorija za sprječavanje ponavljanja

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
    const triSata = 3 * 60 * 60 * 1000; //

    if (!povijestPitanja[soba]) povijestPitanja[soba] = [];

    // Provjera da se pitanje nije pojavilo u zadnja 3 sata
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

    let preostalo = 30; //
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