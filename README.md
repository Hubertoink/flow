# Flow!

Lokale Wochen- und Einsatzplanung mit verschiebbaren Personenschichten,
kopierbaren Teilschichten und Ist-/Sollstunden.

Die zusätzliche **Teamversion** bietet zentrale PostgreSQL-Speicherung, geschützte
Admin-Ersteinrichtung, Einladung und Anmeldung, personenbezogene Planungsrechte,
Schicht- und Wochensperren sowie Zwei-Faktor-Anmeldung. Benutzerfunktionen liegen
im Dropdown neben dem Einstellungsicon. Lokal mit laufendem Docker Desktop:

```powershell
npm install
npm run team:local
```

Danach **http://localhost:4174** öffnen. Der Einrichtungsschlüssel steht in
`.flow-local/config.env`. Anleitung für Testablauf, Datenübernahme, Rechte,
Docker/mittwald und Sicherungen: [Teamversion betreiben](docs/TEAM.md).

## Oberfläche

„Flexible Aufgabe“ steht in der Aufgabenleiste immer hinter den übrigen Vorlagen.
Ein Dreieck mit Pluszeichen in der Größe der anderen Farbpunkte kennzeichnet sie.
Die Aufgaben bleiben in einer Zeile; bei wenig Platz lässt sich die Leiste
horizontal scrollen.

Über den Personenschichten zeigt eine schmale Aufgaben-Spur, was am jeweiligen
Tag stattfindet. Gleich benannte Aufgaben werden einmal angezeigt; überlappende
oder direkt angrenzende Zeiten werden zusammengeführt. Zeitliche Lücken bleiben
sichtbar. Aufgaben ohne zeitliche Überschneidung teilen sich eine Zeile. Beim
Überfahren erscheinen alle Zeiträume und die zugeordneten Personen. Die Übersicht
folgt den Aufgaben in den Schichten automatisch und fügt keine eigenen Schichten hinzu.
Zusätzliche Beschriftungen neben kurzen Aufgabenbalken erscheinen nur im
ausgeklappten Tag, als schlichter Text mit dezenter Uhrzeit wie bei Schichtaufgaben.
Die gleich breite Wochenansicht bleibt ohne diese Zusatztexte.

Ein Klick auf eine Schicht öffnet ihren Bearbeitungsmodus, auch beim Klick auf
ein enthaltenes Aufgabensegment. Weitere Klicks auf den Schichthintergrund lassen
sie geöffnet; ein Klick auf eine Aufgabe öffnet dann deren Details. Das
Bearbeitungsicon bleibt zum Öffnen und Schließen erhalten. Ziehen und
Größenänderungen öffnen die Schicht nicht versehentlich.

Ein Doppelklick auf eine ausgeklappte Aufgabe öffnet ihre Zeiten, Bezeichnung
und **Aufgabe löschen**. Die zugehörige Schicht bleibt beim Löschen erhalten.
Die Teamversion bestätigt das Speichern ohne Ausblenden der Oberfläche und
ohne erneuten Canvas-Aufbau, wenn der Server den dargestellten Plan bestätigt.

Schichten eines Tages stehen kompakt untereinander mit 12 Pixeln Abstand,
ohne große Leerstellen. Vertikales Ziehen bestimmt die Reihenfolge: oberhalb
oder unterhalb einer anderen Schicht. Die anderen Schichten rücken mit;
die Vorschau entspricht der Position nach dem Loslassen. Abbrechen stellt
die vorherige Reihenfolge wieder her. Bestehende und importierte Pläne werden
in ihrer bisherigen Reihenfolge kompakt angeordnet.

Unter **Allgemein** lassen sich **Samstag anzeigen** und **Sonntag anzeigen**
unabhängig aktivieren. Dieselbe Auswahl gibt es beim Excel- und PNG-Export.
Ausgeblendete Tage behalten ihre Schichten; die Wochenstunden zählen weiterhin
Montag bis Sonntag. Die Auswahl wird gespeichert und beim Plantransfer übernommen.
Die bisherige Einstellung „Wochenende anzeigen“ wird in beide Tagesoptionen
überführt.

Auch an Tagen mit 0 Sollstunden können Mitarbeitende eingeplant werden.
Neue Schichten starten dort mit 3 Stunden Anwesenheit und können danach wie
gewohnt angepasst werden. Tages- und Wochensoll bleiben unverändert; Pausen
werden nach den eingestellten Regeln von den Iststunden abgezogen.

Beim Überfahren der Tage zählen die Stunden in den Mitarbeitenden-Pills über
höchstens drei Zwischenwerte zum Ziel. Die Wechsel erfolgen im ruhigen Takt mit
dezenter Überblendung; auch große Sprünge bleiben kurz. Flüchtiges Überfahren
eines Tages löst keinen Zahlenwechsel aus. Schnelle Tageswechsel setzen am gerade
sichtbaren Wert an. Jede Pill reserviert
Platz für ihre längste Anzeige einschließlich der Zwischenwerte, sodass Breiten
und Nachbarpositionen stabil bleiben. Bei reduzierter Bewegung wechseln die
Werte sofort; Arbeitszeiten und Sollstunden werden durch die Animation nicht geändert.

Schichten zeigen hinter der Uhrzeit ihre Netto-Arbeitszeit in Klammern,
zum Beispiel **10:00–18:30 (8 h)** bei 30 Minuten Pause. Die Anzeige aktualisiert
sich beim Ändern der Schichtdauer oder Pausenregel und erscheint auch im
PNG-Export und Druck. Bei mehreren Schichten derselben Person am selben Tag
wird die tägliche Pause wie im Excel-Export anteilig verteilt.

Beim Ziehen einer Person oder Schichtkopie werden belegte Tage als gesperrt
angezeigt. Beim Wechsel auf einen freien Tag ist das Ablegen sofort wieder
möglich; die bisherige Warnung und ausstehende Aufklapp-Timer werden entfernt.

Ganze Tage lassen sich ebenfalls kopieren: Beim Überfahren des Tageskopfs
erscheint neben dem Wochentag ein Kopier-Symbol. Die Tageskopie liegt danach
neben den Mitgliedern und wird wie eine Schichtkopie auf einen anderen Tag
gezogen oder angeklickt und dort abgelegt. Personen, die dort bereits eingeplant
oder nicht im Team sind, werden übersprungen; das Einfügen lässt sich rückgängig
machen. Mitarbeitende und Aufgabenvorlagen bieten dieselben 20 Farbvorgaben
wie flexible Aufgaben.

Ein Klick auf das **KW-Badge** kopiert die gesamte Woche als Pill neben den
Mitgliedern. Danach zur gewünschten Woche wechseln und die Pill auf die
Planungsfläche ziehen; alternativ die Pill anklicken und auf der Fläche klicken
oder Enter drücken. Alle sieben Wochentage werden übernommen, einschließlich
ausgeblendeter Wochenendtage. Uhrzeiten, Aufgaben, Farben und die Reihenfolge
innerhalb der Tage bleiben erhalten. Bereits belegte Personentage sowie im
Zielzeitraum nicht aktive Personen werden übersprungen. Die Vorschau zeigt die
Anzahl vor dem Ablegen; **Rückgängig** entfernt alle gerade eingefügten Schichten.
Die Kopie bleibt für weitere Wochen verfügbar, bis sie ersetzt oder verworfen wird.

Die Einstellungen (Zahnrad neben dem Drei-Punkte-Menü oder **Weitere Optionen → Einstellungen**)
sind über ein linkes Menü in **Allgemein**, **Pausenregelung**, **Mitarbeitende**,
**Aufgabenvorlagen** und **Updates** gegliedert; die Reiter lassen sich auch
mit den Pfeiltasten wechseln. Bei schmalen Fenstern liegen sie oben.

Unter **Einstellungen → Pausenregelung** lassen sich beliebig viele Stufen aus
Stundengrenze und Pausenminuten festlegen, zum Beispiel ab 6 Stunden 30 Minuten
und ab 9 Stunden 45 Minuten. Grenzen gelten inklusive und beziehen sich auf
die summierte Anwesenheit einer Person pro Tag, auch bei mehreren Schichten.
Nur die höchste zutreffende Pausendauer wird abgezogen. Stufen müssen
eindeutig sein und dürfen die Pausendauer nicht verringern.
Die Regel wird explizit gespeichert; vorhandene Pläne starten ohne Abzug.
Alle Stufen entfernen und speichern deaktiviert den Abzug.

Ist-Stunden in der Wochenübersicht sowie Excel und CSV sind **netto**.
Sollstunden und Tagesstunden bleiben Netto-Arbeitszeitziele: 8 Tagesstunden
erzeugen bei 30 Minuten Pause eine neue Schicht mit 8,5 Stunden Anwesenheit.
Passt die Anwesenheit nicht in 08:00–24:00, erscheint eine Fehlermeldung.
Bestehende Schichtzeiten und Kopien werden nicht automatisch verlängert;
ihre Ist-Stunden werden bei Regeländerungen sofort neu berechnet.
Excel-/CSV-Schichtdetails zeigen Anwesenheit, Pausenanteil und Netto-Stunden.
Bei mehreren Schichten wird die Tagespause proportional auf diese verteilt,
ohne eine konkrete Pausenlage zu erfinden. Aufgabenzeiten bleiben brutto und
werden entsprechend gekennzeichnet; PNG und Druck behalten die realen Zeiten.
Die Pausenregel bleibt beim Neustart erhalten und ist im JSON-Backup enthalten.

Unter **Einstellungen → Allgemein → Design** stehen **Dunkel**, **Hell**
und **Catppuccin Mocha** zur Wahl. Die Auswahl bleibt beim Neustart erhalten;
Text, Eingabefelder, Raster und Bildexport verwenden das gewählte Design.
Unter **Einstellungen → Allgemein → Hintergrund** können die vier mitgelieferten
Landschaftsbilder oder **Kein Hintergrund** ausgewählt werden. Außerhalb des Canvas
bleibt das Motiv deutlicher sichtbar; im Canvas sorgen Weichzeichnung und eine
stärkere Design-Überlagerung für lesbare Schichten. Die Auswahl wird gespeichert
und mit dem vollständigen Planexport übertragen. Bilder werden lokal mitgeliefert;
Druck und PNG-Export bleiben ohne Hintergrundbild.
Die Tagesköpfe trennen Wochentag/Datum und Stundenleiste mit klaren Abständen.
Der kompakte Tageskopf ist 60 px hoch (mobil 56 px). Die Canvas-Höhe richtet
sich nach dem verfügbaren Platz und den tatsächlichen Schichten, statt eine
unnötige Mindesthöhe zu erzwingen. Vertikales Scrollen erscheint nur, wenn
Schichten einschließlich ausgeklappter Aufgaben mehr Platz benötigen.

Bei geöffnetem Einzeltag zeigen die übrigen, schmalen Tage kleine farbige,
abgerundete Pillen für alle Schichten, ohne Rahmen oder sichtbare Namen.
Position und Länge bilden die Schichtzeiten proportional ab; die ursprünglichen
Personen- und Aufgabenfarben bleiben erhalten.
Der Tooltip enthält Personenname, vollständige Zeiten und Aufgaben.
Ein Klick oder die Tastaturaktivierung einer Pille öffnet direkt deren
Tag, ohne Schichten zu verändern. Druck und Bildexport bleiben vollständige
Wochenansichten ohne Miniaturpillen.

Im Bearbeitungsmodus einer Schicht lassen sich Aufgaben an **beiden Enden**
ziehen, auch wenn sie die ganze Schicht ausfüllen. Die kleinste Dauer beträgt
15 Minuten, Aufgaben bleiben innerhalb der Schicht. An gemeinsamen Grenzen
wird die angrenzende Aufgabe entsprechend angepasst. Doppelklick öffnet weiterhin
die genaue Zeiteingabe; **Übernehmen** speichert und schließt den Editor.
Ungültige Zeiten lassen ihn mit einem Hinweis offen.

Die Desktop-App hat keine separate native Titelleiste. Freie Flächen im App-Kopf
sind zum Verschieben des Fensters nutzbar; die nativen Schaltflächen zum
Minimieren, Maximieren und Schließen bleiben oben rechts erhalten.

## Windows-App

Die Distribution ist ein Windows-x64-Installer. Auf GitHub wird er unter
**Actions → Desktop distribution → Flow-Windows** als Build-Artefakt angeboten.
Versionierte Veröffentlichungen erscheinen zusätzlich unter **Releases**.

1. `Flow-Setup-<Version>-x64.exe` herunterladen und starten.
2. Installation für das eigene Windows-Benutzerkonto durchführen.
3. Flow! über Startmenü oder Desktop-Verknüpfung öffnen.

Die App funktioniert offline. Logo, Icon, Schrift, Excel- und Bildexport-Bibliotheken
werden lokal mitgeliefert. Es gibt kein Konto und keinen Cloud-Abgleich.
Pläne bleiben im lokalen Electron-Benutzerprofil unter `%APPDATA%\Flow!`
gespeichert, unabhängig vom Installationsordner und von App-Updates.
Der Browser verwendet einen **separaten** Datenspeicher; Browser-Pläne werden
nicht automatisch in die Desktop-App übernommen.
Vor einem Wechsel oder Update kann über **Weitere Optionen → Plan als JSON
speichern** eine Sicherung angelegt werden. Es gibt derzeit keinen JSON-Import
in der Oberfläche.

Der Installer ist zunächst **nicht signiert**. Windows kann deshalb eine
SmartScreen-Warnung anzeigen. Für eine breite öffentliche Distribution sollte
ein Code-Signing-Zertifikat oder Microsoft Trusted Signing eingerichtet werden.
### Updates

Ab Version 1.1.0 aktualisiert sich die Windows-App aus der App heraus:
**Einstellungen → Updates → Nach Updates suchen**, dann **Herunterladen** und
**Neu starten und installieren**. Kurz nach dem Start sucht Flow! zusätzlich
still nach einer neuen Version und meldet sie per Hinweis; heruntergeladen
wird nur auf Wunsch. Quelle sind die stabilen GitHub-Releases (`latest.yml`).
Planungsdaten bleiben erhalten.

Version 1.0.0 enthält noch keinen Updater: Einmalig den Installer 1.1.0
manuell über die bestehende Installation installieren. Unter Linux gilt der
In-App-Updater nur für das AppImage; AUR-Installationen werden über den
Paketmanager aktualisiert (`yay -Syu`), das portable Archiv manuell.

## Linux und Omarchy

Der Linux-x86_64-Build liefert:

- `Flow-<Version>-x86_64-linux.AppImage` für den direkten Start;
- `Flow-<Version>-x86_64-linux.tar.gz` für portable Installationen und OmaStore;
- `SHA256SUMS` zur Prüfung der Downloads.
- `Flow-AUR.tar.gz` mit `PKGBUILD` und `.SRCINFO` für das AUR.

Auf Omarchy zunächst aus einer stabilen GitHub-Release herunterladen.
Das portable Archiv vollständig in einen eigenen Ordner entpacken und
`./flow-jugendplan` starten. Nicht nur die ausführbare Datei herauskopieren:
Chromium-Ressourcen und `resources/app.asar` müssen neben ihr liegen.
Alternativ das AppImage ausführbar machen und starten. Falls FUSE nicht
verfügbar ist, das portable Archiv verwenden. Die App startet als normaler
Benutzer, nicht als root; die Chromium-Sandbox bleibt im ausgelieferten
Programm aktiviert.

Pläne liegen unter `${XDG_CONFIG_HOME:-~/.config}/Flow!`. Wayland/Hyprland
wird durch die aktuelle Electron-Version unterstützt. Ein echter Test auf
dem Arbeitsrechner bleibt erforderlich: Der CI-Smoke-Test läuft mit Xvfb,
nicht innerhalb einer Omarchy-/Hyprland-Sitzung.

### OmaStore: vorbereitet, noch nicht als gelistet behauptet

[OmaStore von KitsuneForgering](https://github.com/KitsuneForgering/OmaStore)
ist ein unabhängiger Community-Store für eigenständige Apps aus GitHub-Releases.
Nach dessen [Autorenleitfaden](https://github.com/KitsuneForgering/OmaStore/blob/master/docs/authors.md)
sind ein `omastore.toml` auf dem Default-Branch und eine **stabile** Release mit
Linux-Binary erforderlich. Das [Manifest](omastore.toml) wählt ausdrücklich
unser Linux-Archiv und die darin liegende ausführbare Datei. Der Store
installiert für das Benutzerkonto und erstellt Launcher-/Menüeinträge.

Nach der ersten erfolgreichen Release auf einer Omarchy-Installation:

```sh
omastore check Hubertoink/flow
omastore index Hubertoink/flow
omastore show Hubertoink/flow
omastore install Hubertoink/flow
```

Damit erst die tatsächliche Kompatibilität prüfen und dann installieren.
Der automatische Katalogeintrag hängt vom Index des Community-Stores ab;
er ist nicht allein durch dieses Manifest bestätigt. Der GitHub-Repository-Topic
`omarchy` und `productivity` verbessert die Auffindbarkeit.

Nicht verwechseln mit dem separaten
[Omarchy Store auf omarchystore.com](https://github.com/omarchy-community/store).
Dieser akzeptiert laut
[Einreichungsregeln](https://github.com/omarchy-community/store/blob/main/CONTRIBUTING.md)
nur Arch-/AUR-/Omarchy-Paketmanager-Rezepte, keine AppImages oder eigenen
Installationsskripte. Dort wäre später ein gepflegtes AUR-Paket und ein
Registry-Pull-Request nötig. Die Paketierung ist jetzt vorbereitet; AUR und Store wurden **nicht** eingereicht.
Omarchys offizielles
[Paket-Handbuch](https://github.com/basecamp/omarchy/blob/master/manual/29-other-packages.md)
beschreibt die Installation über Arch und AUR, nicht diesen Community-Store.

### AUR-Paket für Omarchy

Die [Paketvorlage](packaging/aur/PKGBUILD.in) erzeugt **flow-jugendplan-bin**.
Sie nutzt das versionierte portable Release, dessen tatsächliche SHA256-Prüfsumme,
einen Menüeintrag und den Befehl `flow-jugendplan`. Der getestete Electron-Runtime
wird mitgeliefert, damit die App nicht von einem abweichenden System-Electron
abhängt. Das Paket installiert nach `/opt/flow-jugendplan` und lässt die
Chromium-Sandbox aktiviert; deren Helper wird root-eigen mit Modus 4755 installiert.
Flow! steht unter der [MIT-Lizenz](LICENSE); die Electron-/Chromium- und
Bibliothekslizenzen werden ebenfalls mitgeliefert.

Der Linux-Workflow baut das Rezept in einem Arch-Linux-Container mit
`makepkg --nodeps`, prüft dabei Quellen-Prüfsumme und Paketdateien und erzeugt
`.SRCINFO`. Das ersetzt **keinen** Installations- und Wayland-Test auf Omarchy.
Lokal auf Windows werden die Rezeptgenerierung und Metadaten geprüft;
`makepkg` selbst benötigt Arch Linux.

Vor der Veröffentlichung:

1. Eine **neue stabile Version** veröffentlichen, z. B. `npm version patch`,
   danach Branch und neuen Tag pushen. Ab `v1.1.0` enthalten Releases das
   AUR-Rezept; Tags/Release-Dateien nicht nachträglich überschreiben.
2. `Flow-AUR.tar.gz` aus dieser neuen Release entpacken und auf Omarchy als
   normaler Benutzer `makepkg -si` ausführen. Fensterknöpfe, Drag/Resize,
   Speichern nach Neustart und Exporte in Hyprland testen.
3. Prüfen, ob der Paketname im AUR noch frei ist. Mit einem AUR-Konto und
   hinterlegtem SSH-Schlüssel `ssh://aur@aur.archlinux.org/flow-jugendplan-bin.git`
   klonen. `PKGBUILD` und `.SRCINFO` hineinkopieren, committen und pushen.
   **Keine Binärdateien** ins AUR hochladen.
4. Danach ist die Installation mit `yay -S flow-jugendplan-bin` möglich.
   Neue Flow!-Releases benötigen jeweils die aktualisierten beiden Rezeptdateien
   im AUR; das geschieht nicht automatisch durch einen GitHub-Release.
5. Optional den Community-Store per Registry-PR um dieses AUR-Paket ergänzen.
   Dieser verlangt einen aktiven Maintainer und eine angemessene Zahl an Votes;
   eine Aufnahme direkt nach dem ersten Upload ist daher nicht garantiert.

Geschätzter verbleibender Aufwand nach erfolgreichem CI-Build:
**1–2 Stunden** für Omarchy-Test, AUR-Konto/SSH und ersten Upload, sofern keine
Linux-spezifischen Probleme auftreten. Pro Release etwa **5–15 Minuten**
für Rezept-Update und Prüfung. Store-Review und mögliche Fehlerbehebung kommen hinzu.

## Exporte

Die Dialoge **Als Excel exportieren** und **Canvas als Bild exportieren** bieten
unter **Zeitraum** die angezeigte Woche oder einen frei wählbaren Kalendermonat.
Der Excel-Monatsplan zeigt Netto-Stunden je Person und Tag, Monats-Ist und
Monats-Soll sowie vollständige Schichtdetails und Tagesaufgaben. Das Monats-Soll
summiert das Tagesstundenmodell innerhalb des Beschäftigungszeitraums; die
Summen enthalten auch ausgeblendete Wochenenden. Das Monatsbild ordnet die
Wochen untereinander an und lässt Tage außerhalb des Monats leer.
Samstag, Sonntag und die Darstellung der Schichten bleiben wählbar.

Aufgaben-, Projekt- und Dropdown-Dialoge bleiben auch nach zusätzlichen Feldern
oder einer Änderung der Fenstergröße im sichtbaren Fenster. Lange Inhalte
scrollen innerhalb des Dialogs. Schlosssymbole verwenden die Farben des Designs.

### Plan zwischen Rechnern übertragen

Über **Weitere Optionen → Kompletten Plan exportieren** wird eine JSON-Datei
mit allen Wochen, Mitarbeitenden, Aufgabenvorlagen und Einstellungen erstellt.
Diese Datei kannst du beispielsweise per E-Mail oder USB-Stick übertragen.
Auf dem anderen Rechner **Weitere Optionen → Plan importieren** öffnen und
die Datei auswählen. Die Vorschau zeigt Personen, Schichten, Wochen und
Zeitraum. Erst nach ausdrücklicher Bestätigung wird der gesamte Zielplan
ersetzt; es erfolgt keine Zusammenführung. Die exportierte Woche wird geöffnet.

Vor jedem Import wird der vorherige Plan automatisch lokal gesichert.
Unter **Plan importieren → Plan vor dem letzten Import wiederherstellen**
kann diese Sicherung auch nach einem Neustart zurückgespielt werden.
Die Sicherung umfasst nur den Stand vor dem letzten Import; vor wichtigen
Änderungen zusätzlich **Aktuellen Plan exportieren** verwenden.
Schlägt das Speichern fehl, bleibt der bisherige Plan aktiv.

Dateien werden ausschließlich lokal verarbeitet. Auch bisherige
**Plan als JSON speichern**-Exporte (Planversionen 1–3) werden unterstützt.
Ungültige, neuere oder über 10 MB große Dateien werden mit Fehlermeldung
abgelehnt. Die JSON-Datei ist nicht verschlüsselt und enthält Namen und
Einsatzzeiten; nur über geeignete, vertrauenswürdige Wege weitergeben.

Unter **Weitere Optionen**:

- **Als Excel exportieren** erzeugt eine echte `.xlsx`-Datei. Das Blatt
  **Wochenplan** enthält eine alphabetisch sortierte Zeile je Person,
  Montag–Freitag mit getrennten Von-/Bis-Spalten sowie Ist- und Sollstunden
  rechts. Namen und Überschriften bleiben beim Scrollen fixiert, Spalten
  sind filter- und sortierbar. Samstag/Sonntag können ergänzt werden.
  Iststunden summieren **immer Montag–Sonntag**, auch wenn die
  Wochenendspalten ausgeblendet sind. Nicht eingeplante aktive Personen
  bleiben mit 0 Iststunden sichtbar. Zeiten sind Excel-Zeitwerte, auch
  24:00 bleibt korrekt; Stunden sind Dezimalzahlen und werden nicht als
  Datum interpretiert. Bei mehreren Schichten pro Tag werden die einzelnen
  Intervalle zeilenweise in der Tageszelle dargestellt.
  **Schichtdetails** enthält alle Schichten und Aufgaben mit Datum, Zeit,
  Bezeichnung, Farbe und numerischer Dauer. Für Summen dieses Blattes nach
  `Eintrag = Schicht` filtern, damit Aufgaben nicht doppelt gezählt werden.
- **Canvas als Bild exportieren** erzeugt ein PNG in zweifacher Auflösung.
  Alle Tage werden gleich breit und alle Schichten vollständig exportiert,
  unabhängig von Fokus, Zoom und Scrollposition. Wählbar sind
  **alle ausgeklappt** (jede Teilschicht separat) und **alle eingeklappt**
  (kompakte Personenschichten). Der Live-Plan bleibt unverändert.
  Sehr große Pläne erhalten statt eines abgeschnittenen Bildes einen
  Hinweis, kompakt oder ohne Wochenende zu exportieren.
- CSV, JSON-Sicherung und Drucken bleiben verfügbar.

## Entwicklung und Prüfung

Node.js 24 und npm verwenden:

```powershell
npm ci
npm run vendor
npm run check
npm test
npm run test:desktop
npm run desktop
```

Die Browser-Ansicht ist mit `npm run dev` unter
`http://127.0.0.1:4173` erreichbar.

`dist` enthält die auslieferbaren Browser-Dateien; `desktop/main.cjs`
startet sie über einen festen lokalen `flow://app`-Ursprung.
Renderer haben keinen Node-Zugriff. Das bereitgestellte PNG und ICO liegen
unter `assets`; `npm run vendor` kopiert sie und die versionierten Bibliotheken
inklusive Lizenzen nach `dist`. Die installierte App benötigt kein npm.

## Distribution erstellen

Lokal unter Windows:

```powershell
npm ci
npm run dist:win
```

Ergebnis: `release\Flow-Setup-<Version>-x64.exe` sowie `latest.yml` und
`.blockmap` für den In-App-Updater.
Build-Ausgaben gehören nicht ins Git-Repository.

Linux-Distribution auf Linux mit `npm run dist:linux` erstellen.
Der Windows-Rechner baut nicht den Linux-Installer; dafür ist der Linux-CI-Job
zuständig.

Der Workflow [Desktop distribution](.github/workflows/desktop-release.yml)
prüft bei Push auf `main`, Pull Requests oder manuellem Start Tests,
Desktop-Start, Excel-/PNG-Export und erstellt anschließend Windows- und
Linux-Distributionen. Nur der isolierte Linux-CI-Smoke-Test startet Electron
mit `--no-sandbox`, weil Ubuntu-Runner unprivilegierte User-Namespaces
einschränken können; das Flag ist nicht Bestandteil des App-Launchers.
Für eine versionierte GitHub-Release:

```powershell
npm version patch
git push
git push --tags
```

Ein Tag `v<Version>` startet den Workflow und veröffentlicht nach erfolgreichem
Build die Distributionen samt Update-Metadaten (`latest.yml`,
`latest-linux.yml`, Blockmap) auf der GitHub-Releases-Seite. Diese Dateien
müssen in jeder Release enthalten sein, sonst finden installierte Apps das
Update nicht. Das erste Release kann mit
`git tag v1.0.0` und `git push origin v1.0.0` angelegt werden.
Signing-Zertifikate und Tokens gehören ausschließlich in GitHub-Secrets,
niemals ins Repository.
Ein Klick auf den Datumsbereich oben öffnet einen Monatskalender.
Mit den Pfeilen lässt sich durch Monate blättern; ein Tagesklick öffnet die
zugehörige Woche. Punkte am Monatsnamen und an Tagen markieren vorhandene
Schichten, auch außerhalb der aktuell angezeigten Woche und an Wochenenden.
Die aktuelle Woche ist hinterlegt, der heutige Tag umrandet. Pfeiltasten
sowie Pos1/Ende navigieren durch Tage; Escape schließt den Kalender.

### Aufgaben zuerst planen

Aufgabenvorlagen aus der Fußleiste können in die schmale Tagesleiste gezogen werden. Dort entstehen eigenständige Tagesaufgaben, auch ohne Schicht. Die Ränder ändern die Zeitspanne; ein Klick öffnet Namen, Zeiten und Zuordnungen. Unbesetzte Aufgaben sind gestrichelt.

Eine Tagesaufgabe auf eine Schicht ziehen oder einen Mitarbeitenden-Token auf die Aufgabe ziehen, um zuzuordnen. Ohne vorhandene Schicht wird die Standardarbeitszeit verwendet. Bei Konflikten stehen freie Teilzeiten oder, wenn möglich, eine Schichterweiterung zur Auswahl; bestehende Aufgaben bleiben erhalten. Mehrere Personen teilen sich dieselbe Tagesaufgabe. Einzelne Zuordnungen können im Aufgabendialog entfernt werden.

Tagesaufgaben und Verknüpfungen bleiben im lokalen Plan und im vollständigen JSON-Export erhalten. Tages- und Wochenkopien übernehmen auch noch unbesetzte Aufgaben. Vorhandene Schichtaufgaben werden beim Laden nach Tag und Bezeichnung zusammengeführt.

Ab Version 1.6.0 enthält der Bildexport die Tagesaufgabenleiste. Excel ergänzt das Blatt „Tagesaufgaben“ mit Zeiträumen und Zuordnungen, CSV entsprechende Tagesaufgaben-Zeilen; auch unbesetzte Aufgaben werden ausgegeben. Der vollständige Planexport sichert Aufgaben und Verknüpfungen verlustfrei. Sobald Aufgaben zugeordnet sind, bestimmen die Zeiten in den Schichten den oberen Balken. Beim Vergrößern sortiert sich die Aufgabenleiste bereits in der Vorschau neu.

### Projektübersicht (Entwicklung)

Unter den Schichten ergänzt eine einklappbare, in der Höhe verstellbare Projektspur die Wochenplanung. Unter Einstellungen → Allgemein lässt sie sich ausblenden. Sechs Wochen oder drei Monate zeigen Projekte mit zusammenhängenden Phasen; die ausgewählte Planungswoche wird hervorgehoben. Phasengrenzen lassen sich ziehen, Phasen bearbeiten oder teilen. Mitarbeitenden-Tokens können direkt auf Phasen gezogen werden; die Zuordnung steht für Verantwortung und erzeugt keine Arbeitsstunden.

Über „In dieser Woche einplanen“ wird eine Phase an einem passenden Tag als eigenständige Tagesaufgabe angelegt. Die konkrete Schichtzuordnung erfolgt anschließend in der Aufgabenleiste. Projekte bleiben beim Ausblenden erhalten und sind einschließlich Phasen, Verantwortlichen und Ansichtseinstellungen im vollständigen JSON-Planexport enthalten. Tages- und Wochenkopien verändern die langfristigen Projekte nicht. Bild-, Tabellen- und Druckexporte bleiben auf die Einsatzplanung ausgerichtet.

Die Drei-Monats-Projektansicht zeigt zwölf Wochen um heute (sechs Wochen zurück und sechs voraus); eine senkrechte Linie markiert den heutigen Tag. Über Projektname → „Projektphasen festlegen“ öffnet sich eine vergrößerte Gesamtansicht ohne zusätzliche Kachel. Phasen lassen sich dort teilen, umsortieren, an ihren Grenzen ziehen und Personen zuordnen. Änderungen werden erst mit „Änderungen übernehmen“ gespeichert; Abbrechen und Escape verwerfen den Entwurf. Für Projektfarben steht dieselbe 20-Farben-Palette wie bei Aufgaben zur Verfügung.

Projektphasen können direkt aus der unteren Spur auf einen Tag gezogen werden. Im geöffneten Tagesraster bestimmt die Ablageposition den Beginn; auf Tagesköpfen gilt zunächst 10:00–12:00. Die Aufgabe lässt sich danach in der Aufgabenleiste anpassen und zuordnen. Ein Drop auf die Wochenanzeige öffnet eine Auswahl passender Tage und einer gemeinsamen Uhrzeit. Bereits eingeplante Tage sowie Tage außerhalb der Phase werden abgefangen. Das Anlegen erzeugt keine automatischen Personenschichten und lässt sich über die Rückgängig-Aktion zurücknehmen.
