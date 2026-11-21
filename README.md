# Signage Studio

Een Next.js-dashboard met één beheeraccount en vijf onafhankelijke Full HD-spelers.

| Apparaat | Scherm-ID's |
| --- | --- |
| Raspberry Pi 4 | pi-1, pi-2 |
| Dell Wyse 5070 | wyse-1, wyse-2, wyse-3 |

## Lokaal starten

1. Gebruik Node.js 22 en voer `npm ci` uit.
2. Kopieer `.env.example` naar `.env.local`.
3. Stel `SIGNAGE_PASSWORD` in op een uniek, willekeurig wachtwoord van minstens 16 tekens. Gebruik voor `SIGNAGE_SECRET` een andere willekeurige waarde van minstens 32 tekens. Laat beide opslagvariabelen leeg.
4. Voer `npm run dev` uit. Open [localhost:3000](http://localhost:3000). Lokale gegevens blijven in `.signage/`.

## Publiceren op een scherm

1. Upload media bij **Media** of maak een **Menukaart**.
2. Voeg de items in gewenste volgorde toe aan een **Playlist** en stel per item de afspeelduur in. Bij video gaat de speler door als de video eindigt of zodra de ingestelde tijd verstreken is.
3. Wijs de playlist toe bij **Schermen** en klik **Publiceren**. Bij een bestaande toewijzing kun je vanuit de playlist **Opslaan en publiceren op [scherm]** kiezen. Alleen opgeslagen wijzigingen worden in **Schermen** gemarkeerd tot je ze publiceert.
4. Open of kopieer de volledige schermlink. Het gedeelte na het hekje is de sleutel voor dat scherm. Behandel de volledige link als een wachtwoord.

## Vercel

Importeer de GitHub-repository in een apart Vercel-project en gebruik Node.js 22. Verbind een eigen PostgreSQL-database en een privé Vercel Blob-store. Stel de volgende variabelen in voor Production.

| Variabele | Waarde |
| --- | --- |
| `DATABASE_URL` | Gepoolde PostgreSQL-URL. De databasegebruiker moet een tabel kunnen maken. |
| `BLOB_READ_WRITE_TOKEN` | Token van de privé Blob-store. Vercel voegt dit toe wanneer de store gekoppeld is aan Production. |
| `SIGNAGE_PASSWORD` | Uniek willekeurig beheerderswachtwoord van minstens 16 tekens. |
| `SIGNAGE_SECRET` | Willekeurige sleutel van minstens 32 tekens. Een wijziging vervangt alle vijf schermlinks en beëindigt beheersessies. |

Gebruik voor de kiosk de productie-URL via HTTPS. De spelers moeten de productie-URL zonder Vercel-account kunnen bereiken. Het dashboard zelf vraagt om het beheerderswachtwoord en de speler-API om de sleutel van het scherm. De mediabibliotheek accepteert JPEG, PNG, WebP, MP4 en WebM tot 64 MB per bestand. Gebruik voor de proef 1080p H.264/MP4 en controleer hardwaredecodering op beide apparaten.

## Spelers op Linux

Open per scherm de eigen URL in Chromium-kioskmodus. Denk aan één Chromium-profiel per scherm, zodat elk venster een eigen URL en cache kan behouden. Stel de vensterplaatsing en automatische start per apparaat in met de bestaande Wayland-compositorconfiguratie. Controleer op de Pi de twee Kanshi-uitgangen op 1920×1080 bij 60 Hz en op de Wyse de drie uitgangen. Noteer na het testen welke fysieke uitgang bij elk scherm-ID hoort.

De speler controleert ongeveer om de 30 seconden op een nieuwe publicatie. Hij wisselt pas als alle bestanden daarvan in de browsercache staan. De service worker kan de speler daarna opnieuw openen bij internetuitval. Een eerste start vraagt verbinding, en de browser kan zijn opslag wissen of opruimen. Eén publicatie bevat maximaal 160 MB unieke mediabestanden. Test iedere kiosk door die online te openen, op **Publicatie geladen** te wachten, de verbinding te verbreken en de speler opnieuw te laden.

Elke speler stuurt ongeveer elke 30 seconden een signaal met de geladen publicatie, het zichtbare item en een eventuele afspeelfout. Na ruim twee minuten zonder signaal toont het dashboard **Geen signaal**.

Bij **Voorbeelden** staan de vijf schermen naast elkaar in portretformaat. Het dashboard toont het laatst gemelde item uit de huidige publicatie. Als er geen bruikbare melding is, toont het het eerste item van de publicatie. Voor de fysieke beeldweergave blijft een test aan het scherm nodig.

Kies bij **Schermen → Schermoriëntatie** per scherm voor **Automatisch**, **Portret** of **Landschap**. In automatische modus kiest de speler de indeling op basis van zijn viewport. De andere opties leggen de menukaartindeling vast. De speler neemt wijzigingen mee bij de volgende synchronisatie, zonder de playlist opnieuw te publiceren.
