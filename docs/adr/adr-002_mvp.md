# ADR-002: Begründung des MVP-Schnitts

## Kontext
Der MVP soll den minimalen, aber vollständigen Kernablauf der Anwendung abdecken, der notwendig ist, um die App überhaupt nutzbar zu testen.

## Entscheidung
Die User Stories des MVPs wurden so gewählt, dass Nutzer:innen sich mit einer Server-Instanz verbinden, einen Account erstellen, einen Chat erstellen bzw. sich gegenseitig einladen und anschließend Nachrichten austauschen können. Damit ist der vollständige Weg von der Erstnutzung bis zur ersten Konversation abgebildet.

Zusätzlich wurde das **Löschen des Accounts** in den Scope aufgenommen, um sicherzustellen, dass Nutzer:innen ihre persönlichen Daten jederzeit eigenständig entfernen können.

## Konsequenzen
- Komfortfunktionen (z. B. Profilbilder, Emoji-Reaktionen, Push-Benachrichtigungen) sind bewusst nicht Teil des MVPs.
- Der MVP deckt nur den privaten Chat-Flow ab; öffentliche Chats, Broadcasts und Admin-Funktionen folgen später.
