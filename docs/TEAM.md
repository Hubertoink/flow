# Flow! im Team betreiben

Die Teamversion stellt die vorhandene Planungsoberfläche über einen Node.js-Server bereit. PostgreSQL speichert Planungsdaten, Konten, Berechtigungen und Änderungshistorie zentral. Better Auth übernimmt Passwortprüfung, Sitzungen, Passwortzurücksetzen und Zwei-Faktor-Anmeldung. Eine Installation gehört zu einer Einrichtung.

## Lokal starten

Voraussetzungen: Node.js 22 oder neuer, npm, laufendes Docker Desktop mit Linux-Containern. Der lokale Modus startet eine eigene PostgreSQL-Datenbank; bestehende lokale Electron- oder Browserpläne werden nicht automatisch übertragen.

```powershell
npm install
npm run team:local
```

Flow! öffnest du anschließend unter **http://localhost:4174**. App, Datenbank und Backupdienst laufen als lokale Docker-Container im Hintergrund. Die Datenbank nutzt ausschließlich lokal Port 55432. Daten liegen im Docker-Volume `flow-development_flow_development_data` und bleiben nach dem Beenden erhalten. `npm run team:stop` beendet diese drei Container; `npm run team:local` startet sie erneut und baut Änderungen in das Image ein.

Beim ersten Aufruf legst du Einrichtung und Admin-Konto an. Der Einrichtungsschlüssel steht als `FLOW_SETUP_TOKEN` in `.flow-local/config.env`. Diese Datei enthält auch die getrennten zufälligen Datenbank- und Auth-Geheimnisse und ist von Git und Docker-Builds ausgeschlossen. Nach erfolgreicher Einrichtung lässt sich kein zweiter Ersteinrichtungsversuch durchführen. Ein Container-Neustart setzt die Einrichtung nicht zurück.

Benutzerfunktionen befinden sich im **Benutzericon neben Einstellungen, rechts von Heute**. Wochenfreigabe und Wochensperre stehen im vorhandenen Menü **Weitere Optionen**. Im Fußbereich stehen ein Speichericon mit Status-Tooltip und die laufende App-Version sowie gegebenenfalls Veröffentlichung und Zeitsperre. Rechts unten steht immer **Entwurf** oder **Veröffentlicht**. Admins können den Status direkt anklicken und umschalten. Eine kurze Animation bestätigt den erfolgreich gespeicherten Wechsel (bei reduzierter Bewegung ohne Animation). Mitarbeitende sehen den Status ohne Umschaltmöglichkeit. Entwürfe sind bereits gespeichert und für Admins sowie Personen mit „Entwürfe sehen und planen“ sichtbar. Veröffentlichen macht die Woche auch für Personen ohne Entwurfszugriff sichtbar; es verschickt keine Benachrichtigung und fixiert keine Zeiten. Der Änderungsverlauf zeigt Aktion, Person und Zeitpunkt in kompakten Zeilen; Details und Rückgängig bleiben direkt erreichbar.

## Erster Testablauf

1. Einrichtung und Admin-Konto anlegen.
2. Unter **Einstellungen → Mitarbeitende** Marc und den Bufdi als Profile anlegen.
3. Über **Benutzericon → Team & Zugänge → Person einladen** Marc auswählen, E-Mail eintragen und Rechte vergeben. In der Rechtezeile des Bufdi bei Bedarf Anlegen, Ändern, Löschen und Aufgaben aktivieren.
4. Den Einladungslink in einem privaten Browserfenster öffnen. Dadurch bleiben Admin- und Mitarbeitersitzung voneinander getrennt.
5. Mit Marc eigene Schichten und Schichten für den Bufdi planen. Änderungen an anderen Personen werden serverseitig abgewiesen.
6. Als Admin das Schlüsselicon der Schicht anklicken und im Menü direkt darunter **Zeiten fixiert** wählen. Genau ein Häkchen zeigt den aktuellen Zustand; ein Klick auf eine andere Option übernimmt sie. Marc kann Aufgaben innerhalb der Schicht bearbeiten, aber ihre Arbeitszeiten nicht verändern.
7. Eine Aufgabe öffnen und **Verbindliche Aufgabe** aktivieren. Auch innerhalb einer sonst flexiblen Schicht kann diese Zuordnung nicht verändert oder gelöscht werden.
8. Über **Weitere Optionen → Wochenzeiten fixieren** eine Woche schützen. Das verhindert auch neue Schichten an noch leeren Tagen.
9. Zwei Browserfenster bearbeiten denselben Plan. Flow! aktualisiert freie Ansichten alle fünf Sekunden. Ein veralteter Bearbeitungsstand wird abgewiesen; die Meldung bietet Aktualisieren an.

Im lokalen Modus werden E-Mails im **Benutzericon → Lokaler Postausgang** angezeigt. So lassen sich Einladung und Passwortzurücksetzen ohne SMTP prüfen. Passwortzurücksetzen erreichst du auf der Anmeldeseite. Für Admins und Mitarbeitende steht im eigenen Konto zusätzlich Zwei-Faktor-Anmeldung per TOTP zur Verfügung; Wiederherstellungscodes können heruntergeladen werden.

## Rechte und Sperren

Konten und Mitarbeitendenprofile sind getrennt. Ein Profil kann ohne Zugang geplant werden. Ein Konto kann mit einem Profil verbunden werden, braucht diese Verbindung aber nicht zum Lesen des Teamplans. Die Verbindung kann ein Admin ändern. Ein Profil mit verbundenem Konto oder offener Einladung lässt sich nicht versehentlich löschen.

Es gibt die Grundrollen **Admin** und **Mitarbeitend**. Mitarbeitende erhalten getrennte Rechte für Schichten anlegen, ändern, löschen und Aufgaben zuordnen. Diese gelten für die eigene Person und optional für konkrete weitere Personen. Delegationen können mit einem Enddatum versehen werden; das Datum gilt einschließlich in der Zeitzone Europe/Berlin. Projekte, Phasen, Aufgabenvorlagen, Mitarbeitendenprofile, Pausenregeln und Rechteverwaltung gehören zum Admin.

Zusätzlich lässt sich einstellen, ob ein Konto das gesamte Team, nur sich selbst oder sich und delegierte Personen sieht. Die Option **Entwürfe sehen und planen** ist zunächst aktiv, damit Mitarbeitende selbst vor Veröffentlichung planen können. Wird sie deaktiviert, sind nur veröffentlichte Wochen sichtbar und bearbeitbar. Veröffentlichung und Sperre sind unabhängig.

| Zustand | Arbeitszeiten | Aufgaben |
| --- | --- | --- |
| Offen | Mit passendem Recht | Mit passendem Recht |
| Zeiten fixiert | Gesperrt | Mit passendem Recht |
| Vollständig fixiert | Gesperrt | Gesperrt |

Unter **Benutzermenü → Team und Zugänge** kann ein Admin **Neue Schichten mit fixierten Zeiten anlegen** aktivieren. Die Vorgabe gilt serverseitig für neue Schichten und Kopien aller Personen. Aufgaben bleiben mit den jeweiligen Rechten planbar. Bestehende Schichten werden nicht verändert; zum Bearbeiten fixierter Zeiten hebt ein Admin die Sperre über das Schlüsselicon auf.

Eine Wochensperre schützt zusätzlich sämtliche Arbeitszeiten einschließlich noch nicht vorhandener Schichten. Verbindliche einzelne Aufgaben sind unabhängig geschützt. Admins müssen Sperren ausdrücklich aufheben, bevor sie geschützte Inhalte ändern. Sperränderungen werden protokolliert.

Gemeinsame Tagesaufgaben besitzen eigene IDs. Ihre globale Bearbeitung wird separat freigegeben. Persönliche Aufgabenänderungen verändern keine fremden Zuordnungen durch eine automatische Zusammenführung gleichnamiger Aufgaben. Schichterweiterung oder automatische Schichterstellung durch Aufgabenzuordnung benötigt zusätzlich das entsprechende Arbeitszeitrecht.

## Datenübernahme und Exporte

Die Desktop-App und der bisherige lokale Browsermodus bleiben eigenständige lokale Anwendungen. Exportiere einen bisherigen Plan als JSON und importiere ihn als Admin in die Teamversion. Konten, Rechte und Wochenfreigaben werden durch einen Planimport nicht ersetzt. Bereits vorhandene Sperren derselben Schicht- und Aufgaben-IDs bleiben erhalten. Ein Import muss sämtliche Rechte, Sperren und Verknüpfungen erfüllen; ein abgewiesener Import verändert keine Planungsdaten.

Wenn ein importierter Plan das mit dem Admin-Konto verknüpfte Profil entfernen würde, löse zuerst die Profilverknüpfung im Konto. Nach dem Import kannst du das passende Profil wieder verbinden. Sichere den bisherigen Teamplan vor einem vollständigen Ersatz über den JSON-Export oder eine Datenbanksicherung.

Planexporte enthalten die für das Konto sichtbaren Planungsdaten. Sie sind kein vollständiges Systembackup: Konten, Sitzungen, Einladungen und Rechte werden durch den PostgreSQL-Dump gesichert. Die Teamversion arbeitet online; bei Verbindungsverlust werden Planänderungen blockiert und unbestätigte Änderungen zurückgenommen.

## Docker-Images und mittwald

```powershell
docker build -t flow-team:local .
docker build -f Dockerfile.backup -t flow-team-backup:local .
```

Das Anwendungsimage enthält nur Laufzeitabhängigkeiten, Server und Oberfläche. Es startet als Benutzer `node`, benötigt keinen Docker-Socket und unterstützt ein schreibgeschütztes Dateisystem. Die Datenbank wird separat betrieben; ihr Port wird in `compose.yml` nicht extern veröffentlicht.

Für mittwald müssen beide Images unter einer festen Version in einer erreichbaren Registry liegen, beispielsweise GHCR. Keine lokale `build:`-Anweisung wird zum Hoster übertragen. `.env.example` dokumentiert die benötigten Variablen. Erzeuge unabhängige zufällige Geheimnisse, etwa mit:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`FLOW_URL` muss die tatsächliche öffentliche HTTPS-Adresse ohne Unterpfad enthalten. `FLOW_TRUST_PROXY=1` ist für genau einen vorgeschalteten Proxy vorgesehen; die Anzahl muss zum tatsächlichen Domainrouting passen. Die Anwendung nutzt diese URL auch für Einladungen, Passwortlinks und zulässige Browserherkunft.

`compose.yml` ist die Docker-Betriebskonfiguration mit App, PostgreSQL und Backupdienst. `compose.mittwald.yml` enthält eine reduzierte mittwald-Konfiguration mit explizitem Startbefehl und ohne lokale Pfadbindungen. Der Server prüft beim Start die Verbindung zur Datenbank und versucht sie bei kurzzeitig fehlender Bereitschaft erneut. Die tatsächliche Bereitstellung, Ressourcenzuteilung, Registryberechtigung und Domainzuordnung müssen im eigenen mittwald-Projekt eingerichtet werden.

Beispiel für die CLI, nachdem Projekt und Stack gewählt wurden:

```text
mw stack deploy --compose-file compose.mittwald.yml --env-file .env
```

Ordne die Domain in mStudio dem HTTP-Port 8080 des App-Containers zu und richte HTTPS ein. Die Datenbank bleibt intern. Prüfe vor produktiver Nutzung die Erreichbarkeit, Sitzungscookies hinter dem Proxy und SMTP. SMTP wird über `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` und `SMTP_FROM` eingerichtet. Ohne SMTP können Einladungslinks persönlich weitergegeben werden; Passwortlinks benötigen Mailversand oder den ausschließlich lokalen Testpostausgang.

Die mittwald-Datei deklariert Port 5432 für den Zugriff innerhalb der Hostingumgebung, entsprechend der [PostgreSQL-Anleitung](https://developer.mittwald.de/de/docs/v2/platform/databases/postgresql/). Bei gewöhnlichem Docker Compose ist eine solche Portdeklaration dagegen eine Hostfreigabe; verwende dafür `compose.yml` beziehungsweise die lokalen Compose-Dateien.

Die Anwendung migriert das Auth- und Flow!-Schema beim Start unter einer PostgreSQL-Advisory-Sperre. Planungsdatensätze werden einzeln als validierte JSONB-Objekte in `flow_entities` gespeichert; Konten, Mitgliedschaften, Einladungen, Wochenfreigaben, Einstellungen, Postausgang und Audit besitzen eigene Tabellen. Jede Planungsänderung sperrt den gemeinsamen Versionsdatensatz, prüft Berechtigungen und Referenzen und wird vollständig in einer Transaktion gespeichert. Eine abweichende Version führt zu einem Konflikt statt einem stillen Überschreiben.

**Rückgängig** führt die inverse, protokollierte Änderung aus und prüft aktuelle Rechte und Sperren erneut. Es funktioniert nur, solange die betroffenen Datensätze noch dem Ergebnis der ursprünglichen Änderung entsprechen. Spätere unabhängige Änderungen bleiben erhalten; spätere Änderungen desselben Datensatzes werden geschützt.

## Sicherungen, Wiederherstellung und Updates

Der Backupdienst erzeugt nach dem Start und täglich um **03:00 Uhr Europe/Berlin** einen konsistenten PostgreSQL-Dump im Format `custom`. Er schreibt zunächst eine `.partial`-Datei und benennt sie erst nach erfolgreichem Abschluss um. Abgeschlossene Sicherungen liegen im Volume `flow_backups`; Sicherungen älter als 14 Tage werden entfernt. Dieses Volume muss auch vom Hosterbackup erfasst werden. Die Betriebsgeheimnisse und Registrykonfiguration sollten getrennt gesichert werden.

Wiederherstellung zunächst in eine neue, leere Datenbank durchführen:

```text
pg_restore --no-owner --dbname=NEUE_DATENBANK flow-DATUM.dump
```

Danach bei gestoppter Anwendung die Datenbankverbindung auf die wiederhergestellte Datenbank umstellen und Anmeldung, Rechte und Pläne prüfen. Eine laufende Datenbankdatei aus einem Volume zu kopieren ersetzt keinen konsistenten Dump.

Vor Updates: Dump erstellen, feste Imageversion bereitstellen, Container aktualisieren und Healthcheck/Anmeldung/Planänderung prüfen. Ein Image-Rollback ist nur möglich, wenn die alte Version das aktuelle Schema unterstützt; sonst die vor dem Update gesicherte Datenbank wiederherstellen. Die lokale Testreihe prüft einen echten Dump und eine vollständige Wiederherstellung in eine unabhängige Datenbank.

Falls kein Adminzugang mehr möglich ist, kann eine Person mit Server- und Datenbankzugriff `scripts/recover-admin.mjs` ausführen. Das Werkzeug fragt E-Mail und neues Passwort ab, stellt ein bestehendes Admin-Konto wieder her, beendet dessen Sitzungen, deaktiviert die verlorene Zwei-Faktor-Konfiguration und protokolliert die Wiederherstellung. Es erzeugt keine neuen Konten.

```powershell
node --env-file=.flow-local/config.env scripts/recover-admin.mjs
```

Das Werkzeug ist auch im App-Image enthalten. Auf dem Hoster kann es in einer interaktiven Container-Sitzung mit `node scripts/recover-admin.mjs` ausgeführt werden; dort verwendet es die bereits gesetzte Datenbankverbindung.

## Prüfungen

```powershell
npm run check
npm run check:team
npm test
npm run test:team
```

`test:team` benötigt die laufende lokale Datenbank und Edge, Chrome oder Chromium. Alternativ kann `FLOW_TEST_BROWSER` auf eine Chromium-Binary zeigen. Alle Integrationstests verwenden eine zufällig benannte, separate Testdatenbank. Der echte lokale Plan wird nicht verändert. Für die Sicherungsprobe wird der Container `flow-development-database-1` verwendet; `FLOW_TEST_DB_CONTAINER` überschreibt diesen Namen. Die Testdatenbank und die Wiederherstellungsdatenbank werden danach entfernt.

Die erste Version ist für kleine Teams und einen App-Container ausgelegt. Der Postausgang wird von diesem Container bearbeitet. Zusätzliche App-Replikate benötigen einen gemeinsam verriegelten Mailworker. Offline-Synchronisation, Schichttausch-Anträge und E-Mail-Benachrichtigungen bei Planänderungen sind noch keine Produktfunktionen.

Referenzen: [Better Auth](https://better-auth.com/docs/integrations/express), [mittwald Container](https://developer.mittwald.de/de/docs/v2/platform/workloads/containers/), [mittwald Stack-Deployment](https://developer.mittwald.de/de/docs/v2/cli/reference/stack/), [mittwald Datenbanksicherungen](https://developer.mittwald.de/de/docs/v2/guides/operations/database-container-backups/).

## Container-Pakete

Pushes auf `main` ver?ffentlichen nach erfolgreichen Tests `ghcr.io/hubertoink/flow` und `ghcr.io/hubertoink/flow-backup` f?r Linux AMD64 und ARM64. `latest` folgt dem aktuellen Stand; f?r Deployments den unver?nderlichen Tag `sha-<vollst?ndiger Commit>` verwenden. Beide Pakete m?ssen in GitHub Packages ?ffentlich sichtbar sein, wenn mittwald sie ohne Registry-Zugang laden soll.

Die Schichtfixierung ?ffnet sich ?ber das Schl?sselicon neben dem Bearbeiten-Stift. Es erscheint beim Hover, Tastaturfokus und auf Touchger?ten. Aufgaben k?nnen weiterhin einzeln als verbindlich festgelegt werden.
