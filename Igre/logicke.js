// igre/logicke.js

const logickeIgre = {
    // Asinkrona funkcija koja prima bodove i salje ih dalje
    posaljiReach7: async (osvojeniBodovi) => {
        try {
            const odgovor = await fetch("https://www.igre123.net/action/games_ScoresSeo/PublisherScoreSubmit", {
                headers: {
                    "accept": "*/*",
                    "accept-language": "hr,bs,en-US,en;q=0.9",
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "x-requested-with": "XMLHttpRequest"
                },
                "referrer": "https://www.igre123.net/igra/reach-7",
                "body": `gameId=14071&gScore=${osvojeniBodovi}&publisher=zygomatic`,
                "method": "POST",
                "mode": "cors"
            });

            const podaci = await odgovor.text();
            console.log("Odgovor vanjskog servera:", podaci);
        } catch (greska) {
            console.error("Mrezna greska:", greska);
        }
    }
};
