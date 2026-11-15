# Konten, Mitgliedschaften und Werbung

## Google-Konto

Die Anmeldung verwendet Googles Authorization-Code-Verfahren mit PKCE. Das ID-Token wird serverseitig anhand der Google-Signaturschlüssel geprüft; das Spiel erhält weder das Google-Client-Secret noch ein dauerhaftes OAuth-Token. Die eigene Sitzung liegt in einem `HttpOnly`-Cookie. Die Datenbank speichert nur einen Hash des Sitzungstokens.

Vor der Aktivierung müssen diese Umgebungsvariablen in der Netlify-Umgebung eingerichtet werden:

| Variable | Ort | Zweck |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | nur Server | OAuth-Client-ID aus der Google-Konsole |
| `GOOGLE_CLIENT_SECRET` | nur Server | OAuth-Client-Secret; niemals mit `VITE_` beginnen lassen |
| `PUBLIC_SITE_URL` | nur Server | Kanonische Basisadresse der Website, mit `https://` |

Als autorisierte Weiterleitungsadresse in der Google-Konsole muss exakt `PUBLIC_SITE_URL/.netlify/functions/auth?flow=google-callback` eingetragen werden. Bei `netlify dev --port 8889` lautet die lokale Adresse `http://localhost:8889/.netlify/functions/auth?flow=google-callback`.

Die Migration `20261115090000_add_accounts_and_billing` muss auf die Netlify-Datenbank angewendet werden, bevor die neuen Funktionen produktiv genutzt werden. Die erste Google-Verknüpfung übernimmt die Gast-Spieler-ID dieses Browsers. Für ein bereits verknüpftes Google-Konto wird dessen bestehende Spieler-ID genutzt; eine Zusammenführung zweier getrennter Gast- und Kontofortschritte findet nicht statt.

Konten können abgemeldet, exportiert oder gelöscht werden. Beim Löschen werden Konto, Sitzungen und Ranglistenwert entfernt. Daten in bestehenden Spielräumen können verbleiben, bis eine spätere Spielanfrage die Inaktivitäts-Bereinigung ausführt; das ist noch keine sofortige oder vollständige Löschung aller historischen Spielinhalte.

Die Altersangabe ist derzeit eine freiwillige Selbstauskunft, keine Altersprüfung. „Unter 18“ oder „Keine Angabe“ sperrt die Werbefläche.

## Mitgliedschaften

Die Tarife Free, Plus und Pro sind als Produktkatalog und Datenbankmodell vorbereitet. Es gibt noch keinen Zahlungsanbieter, Checkout, Abo-Webhook oder produktiven Zugriff auf Plus-/Pro-Funktionen. Deshalb sind keine Preise eingetragen, Tarife nicht buchbar und alle Konten bleiben effektiv Free. Webhook-Ereignisse sind für spätere doppelte/idempotente Verarbeitung modelliert; ein Anbieter muss erst ausgewählt werden.

Vor dem Livegang sind Anbieter, Preise, Steuerbehandlung, Kündigungsweg, Webhook-Signaturprüfung und serverseitige Entitlement-Prüfungen umzusetzen und rechtlich zu prüfen. Die vorbereiteten Tabellen allein bewirken keine Zahlung und vergeben keine Vorteile.

## Werbung

Die Werbefläche kann nur am Spielende erscheinen. Sie bleibt unsichtbar, wenn das Konto nicht als 18+ markiert ist, der Nutzer Plus/Pro hat, keine bestätigte TCF-Einwilligung für Zweck 1 und Google vorliegt oder die Anzeigenkonfiguration fehlt.

Optionale Frontend-Variablen:

| Variable | Zweck |
| --- | --- |
| `VITE_ADSENSE_CLIENT_ID` | öffentliche AdSense-Publisher-ID |
| `VITE_ADSENSE_SLOT_ID` | Anzeigenflächen-ID |

Diese Variablen allein schalten keine Werbung frei. Vorher muss ein Google-zertifiziertes CMP mit TCF v2 in die Website eingebunden und korrekt konfiguriert sein. Die Anwendung lädt das AdSense-Skript erst nach positiver TCF-Rückmeldung. Ohne CMP, Publisher-/Slot-ID oder dokumentierte Einwilligung wird keine Anzeige angefordert. Das ersetzt keine Rechtsprüfung und garantiert keine vollständige Jugendschutz- oder Datenschutzkonformität.
