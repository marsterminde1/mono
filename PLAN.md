# Monopoly Realtime Arena – Ausbauplan

1. **Spieloberfläche und Orientierung (umgesetzt):** Originalprojekt vollständig übernommen; bestehendes Gold-/Dunkeldesign, alle Grafiken und Spielfunktionen erhalten. Startseite um zwei umschaltbare Grafikvorschauen und eine Spielstart-Anleitung ergänzt. Profil und Raumeinstieg deutsch beschriftet; Kopierfehler in der Lobby sichtbar gemacht. Vorschauen verändern weder Brettregeln noch die bestehende Brettauswahl.
2. **Bestandsaufnahme und Regelkorrekturen:** Bestehende Engine und Tests fachlich prüfen. Kleine und große Brettvariante ausdrücklich den jeweiligen Modi zuordnen; derzeit sind Grafikdateien und 2D-/3D-Komponenten vorhanden, eine separate Regellogik für beide Größen ist noch zu bestätigen. Gefängnis, Karten, Bankrott und Handel mit Regressionstests absichern.
3. **Verlässliche Räume bis 20 Spieler:** Bestehende Netlify-Datenbankanbindung, Sitzungssicherheit und atomare Spielaktionen prüfen und härten. Gleichzeitige Beitritte, volle Räume, Wiederverbindung und Zustandsrevisionen unter Last testen. Einladungen und Übernahme des Hosts bei Ausfällen absichern.
4. **Strategische Bots:** Schwierigkeitsstufen und nachvollziehbare Entscheidungen für Käufe, Liquiditätsreserve, Bauen, Hypotheken und Handel entwickeln. Deterministische Simulationen mit verschiedenen Spielerzahlen und beiden Brettern ergänzen.
5. **Abwechslung und Balance (umgesetzt):** Auktionen, Stadtereignisse, Missionen, Belohnungen und Gebäude-Upgrades als optionale Regeln ergänzen. Rundenlimit und begrenzte Aufholhilfe sind in der Lobby wählbar; bestehende Standardregeln bleiben unverändert.
6. **Erfolge und Ranglisten:** Bestehende Rangliste prüfen und um nachvollziehbare Ergebnisse, Erfolge und Schutz gegen manipulierte Ergebnisse ergänzen.
7. **Freigabe und Gesamtarchiv:** Regeltests, Bot-Simulationen, Browserprüfungen beider Brettvarianten und Lastprüfungen mit 20 Spielern durchführen. Typecheck und Build in der Pipeline auswerten. Neues vollständiges ZIP und detaillierten Prüfbericht bereitstellen.

Jeder Meilenstein erhält eigene überprüfbare Abnahmekriterien. Keine Originaldateien, Grafiken, Texturen, Modi oder Funktionen löschen. Änderungen gezielt ergänzen; Backend und Spiellogik werden in dieser Oberflächenetappe nicht umgebaut.


## Umgesetztes Brett- und Handelsupgrade (5. November 2026)

Die Lobby erhielt die Auswahl 40/80/120 Felder. Die Engine, gespeicherte Räume, Käufe, Farbgruppen, Gebäude, Hypotheken, Handel, Bot-Ausbau und Vermögensberechnung wurden um die zusätzlichen Stadtviertel ergänzt. Die Varianten erhielten 1.500/3.000/4.500 Startgeld, 200/400/600 LOS-Bonus und 1/2/3 reguläre Würfe. Klassische Ansichten und Originaldaten blieben erhalten. Große Bretter erhielten eine zusätzliche flache bzw. CSS-perspektivische Ansicht mit Zoom, Übersicht, Figurenbewegung und Kamerafokus. Das Handelsmenü erhielt Partnersuche, sichtbare Hypotheken und Geldvorschau.

Abnahme: 40 automatisierte Tests und Typecheck bestanden. Deterministische Simulationen liefen auf jedem Brett mit 20 Bots für bis zu 1.600 Engine-Aktionen und prüften gültige Positionen, Käufe und gespeicherte Zustände. Statische React-Render-Prüfungen für Lobby, große Bretter, Besitzverwaltung, Handel und HUD bestanden mit simuliertem Browser-Standort. Diese Prüfungen ersetzten keine Browser-Interaktion und keinen Netzwerk-Lasttest. Kein lokaler Build wurde ausgeführt.

Nächste Schritte blieben echte Browserprüfungen auf Desktop und Mobilgeräten, parallele Raumanfragen mit 20 echten Clients und menschliche Balance-Runden. Die weitere Umsetzung der langfristigen Meilensteine (Bot-Schwierigkeitsstufen, neue Ereignisse/Missionen und Erfolge) blieb offen. Bereits angewandte Datenbankmigrationen wurden nicht verändert; die Erweiterung nutzte die bestehenden gespeicherten Raumzustände.

## Miniaturstadt und Materialgestaltung (5. November 2026)

Eine zusätzliche spielbare Three.js-Stadtansicht wurde für 40/80/120 Felder ergänzt und als anfängliche Ansicht gewählt. Die bisherigen 2D-/3D-Ansichten blieben über die Ansichtsauswahl erreichbar. Prozedurale Gebäude erhielten Fassaden, Fensterrahmen, Gesimse, Dachaufbauten und Türme; ihre Geometrie wurde pro Material zusammengefasst. Ein Holzsockel mit Messingkante, eine grüne Tischfläche, gerichtetes Licht und Schatten ergänzten die Darstellung. Grundstücke blieben anklickbar, Figuren spiegelten den Spielstand, Kameras boten Stadtansicht, Draufsicht, Fokus, Drehen und Zoom. Dekorative Architektur wurde ausdrücklich von Besitzstreifen und tatsächlichen Ausbau-Markern getrennt. Kauf- und Handelsvorschauen erhielten dieselbe Architektur; additive Stile verbanden Menü, Lobby und Spieloberfläche.

Prüfstatus dieser Ergänzung: Typecheck und alle 40 vorhandenen Tests bestanden. Eine zusätzliche ausführbare Geometrieprüfung kontrollierte 672 Kombinationen aus Grundstück und Ausbau auf endliche Geometrie und höchstens fünf Materialgruppen. Kein Build und keine visuelle Browserprüfung wurden ausgeführt. Vor Freigabe sind insbesondere Lesbarkeit, WebGL-Darstellung, mobile Kamerabedienung und Bildrate mit 120 Feldern im Browser zu prüfen. Gebäude sind prozedurale Miniaturen; die hochgeladene Referenz wurde nicht als fertiges 3D-Asset ausgegeben. Backend, Regeln, Migrationen und vorhandene Tests blieben unverändert.

## Redaktionelle Oberflächenverfeinerung (5. November 2026)

Der Einstieg erhielt eine additive Gestaltung mit warmem Papier, Tannengrün und rotem Monopoly-Schriftzug. Die Typografie, Abstände und Aktionshierarchie wurden vereinfacht. Das bestehende Wappen blieb als kleines Siegel im Profil erhalten. Beide Grafikvorschauen, Anleitung, sämtliche Figuren und Farben sowie Raumerstellung, Beitritt, Schnellspiel und Rangliste blieben verfügbar. Ergänzende Stile beruhigten Lobby, Spielkopf, Aktionsleiste und Grundstücksoberflächen. Keine Assets, Dateien, Brettansichten oder Modi wurden entfernt, verschoben oder umbenannt. Backend und Spielregeln blieben unverändert.

Prüfstatus dieser Änderung: Typecheck (`npm run lint`), alle 40 vorhandenen automatisierten Tests (`npm test`) und `git diff --check` bestanden. Diese Ergebnisse bestätigen keine visuelle Browserprüfung. Kein lokaler Build wurde ausgeführt. Desktop-/Mobilansichten, WebGL und Bedienabläufe müssen weiterhin im Browser geprüft werden.

## Spieltisch-Edition und Code-Download (5. November 2026)

Die Oberfläche erhielt einen grünen Spieltisch, gedruckte Grundstücksmotive, einen gerahmten Illustrationsbereich und ein helles Spielerprofil mit ausgewählter Figur. Lokal eingebundene, lizenzierte Lucide-Vektorgrafiken ersetzten Emoji-Darstellungen in Menü, Lobby, HUD, Handel, Protokoll, klassischen Brettfeldern und Miniaturstadt. Figurenkennungen und ursprüngliche 3D-Modelle blieben kompatibel. Das Startkapital im Lobbyprofil folgte nun der Brettgröße. Figur- und Farbauswahl erhielten zugängliche Beschriftungen; die Anleitung erhielt Fokusbegrenzung, Escape und Rückkehr zum auslösenden Knopf. Das vollständige Quellprojekt wurde als ZIP mit Download im Menü bereitgestellt. Bestehende Assets, Modi, Tests, Backend und Migrationen blieben erhalten.

Prüfstatus: Typecheck und alle 40 vorhandenen automatisierten Tests bestanden. SVG-Zuordnung und statisches Rendering wurden zusätzlich geprüft, ebenso ZIP-Integrität und Archivinhalt. Kein lokaler Build und keine visuelle Browserprüfung wurden ausgeführt. Mobile Darstellung und WebGL-Bedienung müssen noch visuell geprüft werden.

## Liquid-Glass-Webgestaltung (5. November 2026)

Die bestehenden Oberflächen erhielten eine additive `.arena-glass`-Gestaltung mit transparenten Materialien, Lichtkanten, abgerundeten Panels und kapselförmigen Auswahlleisten. Markenfarben und Materialrezepte wurden als getrennte CSS-Variablen gepflegt. Menü, Profil, Brettvorschauen, Anleitung, Lobby, Spielkopf, Aktionsleiste, Seitenpanels und Dialograhmen wurden verbunden; der grüne Monopoly-Spieltisch und alle bisherigen Inhalte blieben erhalten. Eingaben erhielten relative Schriftgrößen, Bedienelemente sichtbare Fokuszustände und größere Berührungsflächen. Deckende Ersatzflächen unterstützten Browser ohne Hintergrundfilter und die Einstellung für reduzierte Transparenz; reduzierte Bewegung und erzwungene Kontrastfarben wurden berücksichtigt.

Die README und alle vier Anleitungen aus https://github.com/uladluch/figma-to-swiftui wurden als Referenz gelesen. Übertragbare Prinzipien zu Designvariablen, Materialeffekten, semantischen Bedienelementen und Erhaltung bestehender Geschäftslogik wurden für React/CSS adaptiert. Native SwiftUI-APIs, Xcode-Assets und Figma-Rücksynchronisierung wurden nicht als Webfunktionen ausgegeben. Es lag keine konkrete Figma-Datei für einen exakten Designabgleich vor.

Prüfstatus: Typecheck (`npm run lint`), alle 40 vorhandenen Tests (`npm test`), CSS-Parsing mit Lightning CSS und `git diff --check` bestanden. Kein lokaler Build und keine visuelle Browserprüfung wurden ausgeführt. Desktop-/Mobilansichten, Transparenzkontrast über WebGL und Bedienung auf Touchgeräten bleiben visuell zu prüfen. Bestehende Dateien, Assets, Brettmodi, Regeln, Backend, angewandte Migrationen und Tests wurden erhalten.

## Konsequente Apple-inspirierte Oberfläche (5. November 2026)

Nach Rückmeldung zur vorherigen Gestaltung wurde eine zusätzliche `.arena-apple`-Präsentation umgesetzt. Der Einstieg erhielt eine helle neutralgraue Fläche, Apple-Systemtypografie mit lokalen Ersatzschriften, große serifenlose Überschriften und eine schmale Navigation mit funktionierenden Sprunglinks zum Einstieg und Spielerprofil. Grundstücksmotive wurden als ruhige Informationszeile gestaltet. Brettvorschauen und sämtliche ursprünglichen Grafiken blieben erhalten. Das Spielerprofil erhielt eine weiße Fläche, graue Eingaben und blau gekennzeichnete Auswahl- und Hauptaktionen. Die Lobby wurde als helle gruppierte Einstellungsoberfläche gestaltet. Das laufende Spiel erhielt Graphitflächen, dezente Glasleisten und blaue Aktionen; originale Brettgrafiken, Miniaturstadt und Spielerfarben blieben unabhängig davon erhalten.

Die Anpassung verwendete Systemschriften ohne externe Fontdownloads. Responsive Layouts, sichtbare Tastaturfokusse, Touchgrößen, reduzierte Bewegung und deckende Ersatzflächen für reduzierte Transparenz wurden berücksichtigt. Es wurden keine Originaldateien, Assets, Funktionen oder Modi entfernt, verschoben oder umbenannt. Backend, Spiellogik, Migrationen und Tests blieben unverändert.

Prüfstatus: Typecheck (`npm run lint`), alle 40 vorhandenen Tests (`npm test`), CSS-Parsing und `git diff --check` bestanden. Kein lokaler Build und keine visuelle Browserprüfung wurden ausgeführt. Die tatsächliche Darstellung und Bedienbarkeit auf Desktop und Mobilgeräten bleiben im Browser zu prüfen.

## Lobbyführung, deutsche Texte und klassisches 3D-Brett (5. November 2026)

Die Lobby erhielt eine Startübersicht mit bereiten Spielern, Brettgröße und Zeitlimit. Fehlende Mitspieler und noch nicht bereite Teilnehmer wurden konkret benannt; freie Plätze und Einladungshinweise wurden sichtbar. Raumcode, Einladungen, Gastgeberrolle, Regeln und Spielinformationen wurden verständlich deutsch beschriftet. Profilbearbeitung übernahm beim Öffnen den aktuellen Serverstand, verwarf abgebrochene Entwürfe und verhinderte leere Namen. Beim Speichern blieb der Editor bis zur Serverbestätigung geöffnet; Fehler behielten den Entwurf, und ein Ladezustand verhinderte erneutes Speichern. Bestehende Raumeinstellungen, Bots, Bereitschaft, Einladungen und Startfunktionen blieben erhalten. Zusätzliche Texte in Menüfehlern, Spielverlauf, Spielende und Rangliste wurden deutsch vereinheitlicht.

Die bestehende klassische 40-Felder-Ansicht unter „3D“ erhielt abgerundete Brett- und Sockelkanten, zurückhaltendes Messing, lokale Studioreflexionen, neutraleres Licht und weichere Schatten. Das originale Brett, Figuren, Kartenstapel, Wappen und Architektur blieben erhalten. Zoomtasten und Zwei-Finger-Zoom ergänzten Drehen und Mausradzoom. Hoveranzeigen wurden beim Verlassen zurückgesetzt; Feldklicks verwendeten den aktuellen Callback. Fehlendes WebGL wurde mit einem Hinweis auf die bestehende 2D-Ansicht erklärt. Neu erzeugte Reflexionstexturen und Schattenressourcen wurden beim Verlassen freigegeben. Die separate Miniaturstadt und großen Brettvarianten wurden nicht umgebaut.

Prüfstatus: Typecheck (`npm run lint`), alle 40 vorhandenen Tests (`npm test`), CSS-Parsing und `git diff --check` bestanden. Sechs zusätzliche statische Lobby-Renderprüfungen bestätigten Hinweise für alleinigen Gastgeber, wartenden Gast, bereiten Gast, Bot, Gastansicht und freie Plätze. Diese Prüfungen ersetzten weder Browserinteraktion noch echte Mehrspieler-Netzwerktests. Kein lokaler Build und keine visuelle WebGL-/Mobilprüfung wurden ausgeführt. Backend, Spielregeln, Migrationen und vorhandene Tests blieben unverändert.

## Einladungsbuttons tiefer platziert (5. November 2026)

Nach Klarstellung zur Tablet-Aufnahme wurden „Code kopieren“ und „Freunde einladen“ unter dem Lobbytitel in einer eigenen Zeile mit 28 Pixeln Abstand platziert. Beide Schaltflächen erhielten mindestens 48 Pixel hohe Tippflächen; auf schmalen Geräten stand der Raumcode oberhalb der Aktionen. Der Lobby-Scrollbereich wurde oben ausgerichtet und um sichere Bildschirmabstände ergänzt, damit hohe Inhalte nicht durch vertikale Zentrierung oberhalb des Scrollbereichs lagen. Aktionen und Spielfunktionen blieben erhalten.

Prüfstatus: Typecheck, CSS-Parsing und `git diff --check` bestanden. Keine erneuten Spieltests, kein lokaler Build und keine visuelle Browserprüfung wurden ausgeführt.

## Etappe 2 – Raumzuverlässigkeit (15. November 2026)

Zustandsändernde Poll-Anfragen sperren die Raumzeile wie andere Spielaktionen. Der schnelle Poll-Pfad bleibt nur für nachweislich unveränderte Zustände aktiv; Bot-Züge, offene Handelsangebote und fällige bzw. noch nicht eingerichtete Zuguhren gehen weiterhin durch die transaktionale Verarbeitung. Die gemeinsame Host-Abstimmung hält Gastgeber-ID und Gastgeberkennzeichen synchron, übergibt den Gastgeberstatus beim Verlassen und ermöglicht einem zurückkehrenden Gastgeber die Wiederaufnahme einer verlassenen Bot-Lobby. Neue menschliche Spieler übernehmen eine Lobby, falls kein menschlicher Gastgeber mehr vorhanden ist. Keine Datenbankmigration wurde ergänzt.

Abnahme lokal: 58 Tests, Typecheck (`npm run lint`) und Build bestanden. Ergänzende Tests decken Gastgeberübergabe, Rückkehr und gleichzeitige Beitrittsversuche mit Raumlimit ab. Der Build meldet weiterhin bestehende Hinweise zu Vite-Konfiguration und großen Chunks. Es wurde keine echte Netlify-Datenbank verbunden und kein Netzwerk-Lasttest mit 20 Clients ausgeführt; die PostgreSQL-Sperrwirkung unter realer Parallelität ist daher noch nicht produktionsseitig gemessen.

## Etappe 3 – Strategische Bots (15. November 2026)

Die Lobby bietet drei serverseitig gespeicherte Stufen: einfach, ausgeglichen und strategisch. Ausgeglichen bleibt der Standard für ältere Räume und Spielstände. Die Profile unterscheiden sich bei Geldreserven für Käufe und Häuser. Strategische Bots bevorzugen Bauoptionen mit höherem zusätzlichem Mietertrag, halten bei Zahlungsnot baubare Farbgruppen möglichst intakt und bewerten eingehende Tausche anhand von Geld, Grundstückspreisen, Basismieten, Hypotheken und erreichbaren Farbgruppen. Der geschätzte Tauschnettowert wird als ungefähre Begründung im Spielprotokoll angezeigt.

Abnahme: 64 Tests, Typecheck (`npm run lint`) und Build bestanden. Zusätzliche deterministische Prüfungen liefen mit allen drei Bot-Stufen auf 40-, 80- und 120-Felder-Brettern und prüften gültige Positionen, Geldbeträge und Gebäudegrenzen. Das ist eine Funktions-/Stabilitätsprüfung, keine Balance- oder Spielstärkemessung. Der Build meldet weiterhin Hinweise zu Vite-Konfiguration und großen Chunks. Eine echte Netlify-Datenbank, Browser-Mehrspielerrunden und menschliche Balance-Tests wurden nicht ausgeführt.

## Etappe 4 – Live-Auktionen für abgelehnte Grundstücke (15. November 2026)

Wer den Kauf eines freien Grundstücks ablehnt, startet jetzt eine zehnsekündige Auktion für alle Mitspieler. Das Startgebot beträgt 10 Spielgeld; jedes Folgegebot muss mindestens 10 höher sein. Bei nahezu gleichzeitigen Geboten gilt das zuerst serverseitig angenommene gültige Gebot. Ohne Gebot bleibt das Grundstück bei der Bank. Der Gewinner bezahlt erst nach Auktionsende. Die Lobby-Regeln und die Kaufoptionen anderer Grundstücke wurden nicht verändert.

Ein Gebotsfenster zeigt Grundstück, Zeit, aktuelles Gebot, Höchstbietenden und den eigenen Kontostand. Die Engine prüft Phase, Spielerstatus, ganzzahlige Gebote und Guthaben; die Verarbeitung bleibt durch die bestehende Raumtransaktion serialisiert. Bots bieten stufenabhängig und innerhalb ihrer Geldreserve mit. Das aktuelle Höchstgebot ist für Bau, Hypothekenablösung und Handel reserviert. Scheidet der Höchstbietende durch Bankrott aus, wird die Auktion beim Mindestgebot neu geöffnet. Ablauf und fällige Bot-Gebote verhindern das Überspringen eines unveränderten Polls; dafür war keine Datenbankmigration nötig.

Abnahme lokal: 70 Tests, Typecheck (`npm run lint`), Build (`npm run build`) und `git diff --check` bestanden. Der Build weist weiterhin auf die bestehende Vite-Konfiguration mit `__dirname` sowie auf große JavaScript-Chunks hin. Geprüft wurden Engine-Regeln, Gebotsgrenzen, Endabrechnung, Bot-Obergrenze, reserviertes Geld, Bankrott und Poll-Timing. Keine echte Netlify-Datenbank oder parallelen Netzwerk-Clients, keine visuelle Browser-/Mobilprüfung und keine menschliche Balance-Runde wurden durchgeführt.

## Etappe 5.1 – Stadtereignisse mit Abstimmung (15. November 2026)

Die Abstimmung läuft während der normalen Runde, ohne Spielpause. Jede Person kann bis zum Rundenwechsel für das Ereignis der Folgerunde stimmen und die Stimme ändern. Am Rundenwechsel entscheidet die höchste Stimmenzahl; bei Gleichstand oder ohne abgegebene Stimmen gewinnt der obere Vorschlag. Bots stimmen automatisch: Ist ein Hausbau möglich, wählen sie eher die Bauförderung, andernfalls den Stadtfonds.

Der Stadtfonds zahlt zu Beginn der Folgerunde allen noch aktiven Spielern $25. Die Bauförderung gewährt pro Spieler einmalig $25 Rabatt auf das erste erfolgreich gebaute Haus dieser Runde. Ereignis, Abstimmungen, Rundenzähler und verbleibende Rabatte werden mit dem vorhandenen Spielstand gespeichert. Ältere Spielstände erhalten beim Wiederherstellen sichere Standardwerte. Es wurden weder externe Dienste noch Datenbankmigrationen ergänzt.

Abnahme lokal: 76 Tests, Typecheck (`npm run lint`), Build (`npm run build`) und `git diff --check` bestanden. Engine- und Servertests prüfen Stimmenänderungen, Rundengrenze, Auszahlung, einmaligen Baurabatt, Bankrott des Rundenstarters, Wiederherstellung älterer Spielstände und Übermittlung der Stimme an andere Spieler. Keine echte Netlify-Datenbank, visuelle Browser-/Mobilprüfung oder menschliche Balance-Runde wurde ausgeführt. Die Build-Hinweise zu `__dirname` und großen JavaScript-Chunks bestehen fort. Weitere Teile von Etappe 5 – Gebäude-Upgrades, Missionen/Belohnungen und Zeit-/Aufholregeln – bleiben offen.

## Etappe 5.2 – Wahrzeichen als optionales Gebäude-Upgrade (15. November 2026)

Die Lobby bietet neben dem Standardausbau den optionalen Wahrzeichen-Modus. Ein Wahrzeichen kann nach einem Hotel errichtet werden, wenn der Spieler das ganze Farbset besitzt und keine Gruppe-Hypothek offen ist. Es kostet das Dreifache des Hauspreises, erhöht die Hotelmiete um 50 % und kann für die Hälfte des Ausbaupreises verkauft werden; dabei bleibt das Hotel bestehen. Die Regel wird serverseitig geprüft, ist für ältere Räume und gespeicherte Spielstände standardmäßig ausgeschaltet und wird von Bots berücksichtigt.

Besitzverwaltung, Vermögensanzeige, 2D-/3D-Bretter und Grundstücksvorschau kennzeichnen das Upgrade. Grundstücke mit Gebäuden bleiben wie bisher nicht handelbar oder beleihbar; ein Bankrott gibt das Wahrzeichen zusammen mit dem Grundstück frei.

Abnahme lokal: 80 Tests, Typecheck (`npm run lint`), Build (`npm run build`) und `git diff --check` bestanden. Keine echte Netlify-Datenbank, Browser-/Mobilansicht, Netzwerk-Mehrspieler- oder menschliche Balance-Prüfung wurde durchgeführt. Der Build weist weiterhin auf `__dirname` in der Vite-Konfiguration und ein großes JavaScript-Bundle hin. Missionen/Belohnungen und Zeit-/Aufholregeln bleiben für spätere Teilschritte offen.

## Etappe 5.3 – Missionen mit Spielgeld-Boni pro Partie (15. November 2026)

Alle Mitspielenden erhalten in jeder Partie dieselben drei Missionen: ein Grundstück kaufen oder ersteigern, ein Haus oder Hotel bauen und einmal den LOS-Bonus erhalten. Jede Aufgabe gibt automatisch einmalig $50 Spielgeld; es gibt keinen Kauf, keine tägliche Anmeldepflicht und keinen dauerhaften Kontofortschritt. Bots erhalten dieselben Aufgaben. Die Fortschritte liegen im serverautoritativen Spielstand, werden mit Raum-Snapshots gespeichert und bei alten Spielständen ohne Missionsdaten leer initialisiert. Es wurden keine Datenbankmigrationen ergänzt.

Das Spielpanel zeigt erledigte und offene Missionen im Spielerbereich. Grundstückskäufe über Auktionen und normale Käufe zählen gleichermaßen; das Bonusgeld wird nicht mehrfach ausgezahlt.

Prüfstand: `npm test`, `npm run lint`, `npm run build` und `git diff --check` wurden ausgeführt. Der Build weist weiterhin auf `__dirname` in der Vite-Konfiguration und ein großes JavaScript-Bundle hin. Eine echte Netlify-Datenbank, visuelle Browser-/Mobilansicht, Netzwerk-Mehrspielerrunde und menschliche Balance-Prüfung wurden nicht durchgeführt. Zeit-/Aufholregeln bleiben offen.

## Etappe 5.4 – Rundenlimit, Aufholhilfe und Bot-Simulationen

Die Lobby bietet optional 10, 15 oder 20 vollständige Runden; „Aus“ lässt bisherige Partien unbegrenzt. Am Ende des letzten vollständigen Umlaufs gewinnt die noch aktive Person mit dem höchsten Vermögen. Die Berechnung folgt dem bestehenden HUD (Bargeld, Grundstücke, Häuser, Hotels und Wahrzeichen). Gleichstand wird zuerst mit mehr Bargeld, danach mit Sitzreihenfolge ab dem nächsten Rundenstart aufgelöst. Nach Partieende wird kein weiteres Stadtereignis angewendet und keine neue Abstimmung geöffnet. Der Zugwechsel erhält den Spielende-Zustand nun auch dann, wenn die Partie durch Rundenlimit oder Bankrott endet.

Optional kann die Aufholhilfe eingeschaltet werden: Einmal pro Runde erhält die ärmste aktive Person $50 Spielgeld, sofern sie mindestens $500 hinter der Führung liegt. Gleichstand bei der Auswahl entscheidet die Sitzreihenfolge ab Rundenstart; pro Person sind höchstens $250 je Partie möglich. Hilfe und Rundenlimit sind serverautoritativ im Spielstand gespeichert. Ältere Lobbys und Spielstände erhalten „unbegrenzt“ beziehungsweise „aus“ als sichere Voreinstellung. Änderungen wurden in den produktiven und lokalen Spielpfad integriert; Datenbankmigrationen waren nicht nötig.

Die deterministische Bot-Simulation deckt 24 Kombinationen aus 40/80/120 Feldern, klassischem/Schnellbau, Standard/Wahrzeichen-Ausbau und ausgeschalteter/aktiver Aufholhilfe ab. Jede Runde wurde bis Spielende oder höchstens 10 vollständige Runden simuliert und auf gültige Positionen, Geldbeträge, Gebäudegrenzen sowie gespeicherte Zustände geprüft. Die 24 Partien endeten jeweils in Runde 10 nach 108–404 Engine-Aktionen. Diese Aktionszahl ist keine gemessene reale Spieldauer; das Ziel von 20–30 Minuten ist damit nicht bestätigt und benötigt menschliche Spieltests.

Abnahme lokal: `npm test` (87 Tests), `npm run lint`, `npm run build` und `git diff --check` bestanden. Der Build weist weiterhin auf `__dirname` in der Vite-Konfiguration und ein JavaScript-Bundle über 500 kB hin. Keine echte Netlify-Datenbank, Browser-/Mobilprüfung, Netzwerk-Lastprüfung oder menschliche Balance-Runde wurde durchgeführt.

## Benutzerdefiniertes 3D-Brett

Das vom Nutzer bereitgestellte `arena_board_v2.glb` wird in der klassischen 40-Felder-Three.js-Ansicht als Brettmodell geladen. Die vorhandenen Felder bleiben anklickbar; Spielfiguren, Besitzmarker und Gebäude werden weiterhin aus dem Spielstand erzeugt. Bis das Modell geladen ist oder falls es nicht geladen werden kann, bleibt die bisherige prozedurale Ansicht als Ersatz erhalten. Die 80-/120-Felder-Ansichten und Spielregeln bleiben unberührt. Das GLB ist 16.406.740 Byte groß; Herkunft und kommerzielle Nutzungsrechte des Modells wurden nicht unabhängig geprüft.
