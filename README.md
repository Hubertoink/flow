# Flow! JugendPlan

Lokale Wochen- und Einsatzplanung mit verschiebbaren Personenschichten,
kopierbaren Teilschichten und Ist-/Sollstunden.

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
Es gibt zunächst keine automatischen Updates: Eine neuere Installer-Version
wird manuell über die bestehende Installation installiert.

## Linux und Omarchy

Der Linux-x86_64-Build liefert:

- `Flow-<Version>-x86_64-linux.AppImage` für den direkten Start;
- `Flow-<Version>-x86_64-linux.tar.gz` für portable Installationen und OmaStore;
- `SHA256SUMS` zur Prüfung der Downloads.

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
Registry-Pull-Request nötig. Beides wurde hier **nicht** eingereicht.
Omarchys offizielles
[Paket-Handbuch](https://github.com/basecamp/omarchy/blob/master/manual/29-other-packages.md)
beschreibt die Installation über Arch und AUR, nicht diesen Community-Store.

## Exporte

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

Ergebnis: `release\Flow-Setup-1.0.0-x64.exe`.
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
Build die Distributionen auf der GitHub-Releases-Seite. Das erste Release kann mit
`git tag v1.0.0` und `git push origin v1.0.0` angelegt werden.
Signing-Zertifikate und Tokens gehören ausschließlich in GitHub-Secrets,
niemals ins Repository.
