# ADR-001: Framework-Entscheidung
**Projekt:** Chat-App – Hochschule Esslingen
**Status:** Akzeptiert | **Datum:** 12.10.2026 | **Commit:** 9bd7c3b

## Kontext
Für das Projekt soll eine Chat-App mit Anmeldung, Chatliste, privaten/öffentlichen
Gesprächen und Textnachrichten entwickelt werden. Das Backend (PHP) wird von der
Hochschule bereitgestellt und unterstützt kein WebSocket, sodass ein 5-Sekunden-
Polling-Mechanismus eingesetzt wird.

Vor der endgültigen Framework-Entscheidung wurden die Team-Vorkenntnisse erhoben:
zwei Teammitglieder haben Erfahrung mit **React**, ein Teammitglied mit **Angular**.
Da Angular nicht die Grundlage von React Native oder Ionic bildet, fließt diese
Erfahrung nur indirekt (allgemeines Komponentendenken) in die Bewertung ein.

## Optionen
**A – React Native + Expo + TypeScript**
Native UI-Komponenten; vorhandene Projektbasis mit Navigation, Tests und
Browserdarstellung nutzbar. React-Kenntnisse im Team direkt übertragbar.

**B – Ionic + Capacitor + TypeScript**
Web-basierte UI-Komponenten; grundsätzlich auch mit Angular, React oder Vue
kombinierbar, wodurch die Angular-Erfahrung im Team potenziell nutzbar wäre.

## Gewichtete Entscheidungsmatrix (vor Entscheidung erstellt)

| Kriterium            | Gewicht | React Native | Ionic |
|-----------------------|---------|---------------|-------|
| Vorkenntnisse         | 20 %    | 3             | 3     |
| UX / Look & Feel      | 30 %    | 5             | 4     |
| Gerätezugriff         | 10 %    | 4             | 4     |
| Offlinefähigkeit      | 5 %     | 3             | 3     |
| Entwickeln & Testen   | 25 %    | 5             | 4     |
| Dokumentation         | 10 %    | 5             | 5     |
| **Gesamt**            |         | **4,40**      | **4,10** |

*Hinweis zu „Vorkenntnisse“:* Trotz der React-Mehrheit im Team wurde dieses
Kriterium für beide Optionen gleich bewertet, da auch Ionic React als UI-Layer
unterstützt und somit kein klarer Vorsprung entsteht. Die Angular-Erfahrung
wirkt sich auf keine der beiden Optionen unmittelbar aus.

## Entscheidung
Basierend auf der Matrix fiel die Wahl auf **React Native + Expo + TypeScript**.

Ausschlaggebend waren die mobile Passform sowie die vorhandene, funktionierende
Projektbasis. Da zwei von drei Teammitgliedern bereits React-Erfahrung mitbringen,
senkt dies zusätzlich die Einstiegshürde.

## Konsequenzen
**Positiv:**
- Gemeinsame Codebasis für Browser und Mobilgeräte
- Geringe Einstiegshürde durch vorhandene React-Kenntnisse im Team

**Einschränkungen:**
- Expo/RN-Versionen müssen kompatibel gehalten werden
- Browsertests ersetzen keine nativen Tests (Android/iOS ausstehend)
- AsyncStorage ist keine sichere Ablage → für Produktion gesondert prüfen
- Chat-Umbenennung und Push-Nachrichten sind über die bestehende API nicht möglich
