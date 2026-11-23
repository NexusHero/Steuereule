# Tasks

The same four tasks as in the automated measurement (#450 part 2A). Each task is on its own card, which the participant only receives once the previous one is done or abandoned. The facilitator reads the card aloud and starts the stopwatch when the participant touches the mouse. The card text stays in German for the session; the English translation below it is for the facilitator.

**Time limit per task:** 8 minutes. After that the task counts as not completed.

## Test person „Lena Probe“ (synthetic)

| Item | Value |
| :--- | :--- |
| Tax year | 2025 |
| Occupation | employed, single, no children, lives in Germany |
| Lohnsteuerbescheinigung (wage tax certificate) | gross wages €45,000, wage tax €6,100, social security €9,200 |
| Commute | 18 km one way, car, 5 days per week, 30 vacation days, 5 sick days |
| Donations | €150 |

These values lie printed on the table as a „Lohnsteuerbescheinigung“ (template: `e2e/fixtures/synthetic-documents.mjs`, `syntheticLstbLines`).

---

## Task 1 — First run

> „Sie wollen Ihre Steuererklärung für 2025 vorbereiten. Beantworten Sie die Einstiegsfragen, tragen Sie Ihre Lohnsteuerbescheinigung und Ihren Arbeitsweg ein und gehen Sie so weit, bis die App Ihnen sagt, dass Sie die Abgabe vorbereiten können.“
>
> (English: "You want to prepare your tax return for 2025. Answer the opening questions, enter your Lohnsteuerbescheinigung and your commute, and go on until the app tells you that you can prepare the submission.")

- **Start:** signed in, empty cockpit 2025.
- **Success:** the page „Abgabe vorbereiten“ ("Prepare submission") is reached, the refund range is shown.
- **Count as errors:** wrong amount saved, wrong answer in the interview, help from the facilitator needed.

## Task 2 — Correction

> „Ihnen fällt auf, dass auf der Lohnsteuerbescheinigung eigentlich 46.200 € Bruttoarbeitslohn stehen. Korrigieren Sie den Wert.“
>
> (English: "You notice that the Lohnsteuerbescheinigung actually shows €46,200 gross wages. Correct the value.")

- **Start:** end of task 1.
- **Success:** gross wages are €46,200, all other values are unchanged.
- **Count as errors:** another value changed, interview restarted, value not saved.

## Task 3 — Interruption

> „Sie tragen gerade Ihre Spenden ein, da fällt Ihnen ein, dass Sie den Spendenbeleg erst suchen müssen. Schauen Sie nach, wo Sie in der App Belege ablegen können, und kehren Sie dann zu den Spenden zurück. Tragen Sie 150 € ein.“
>
> (English: "You are entering your donations when you remember that you first have to find the donation receipt. Look up where you can store documents in the app, and then return to the donations. Enter €150.")

- **Start:** the facilitator opens the donations question.
- **Success:** the documents area was opened, and afterwards €150 of donations are saved.
- **Count as errors:** input lost, way back not found, donations saved twice or not at all.

## Task 4 — Re-entry

> „Machen Sie eine Pause: Schließen Sie das Browserfenster. Öffnen Sie die App danach wieder und machen Sie dort weiter, wo Sie aufgehört haben.“
>
> (English: "Take a break: close the browser window. Then open the app again and continue where you left off.")

- **Start:** the facilitator opens it in the middle of the commute screen, after the participant has changed the kilometers but has not clicked on.
- **Success:** the participant lands back at the open step without a detour; the previously saved details are there.
- **Count as errors:** details missing, participant starts from the beginning, needs help.

---

## What is noted per task

| Metric | How |
| :--- | :--- |
| Time | stopwatch, seconds, from the start to success or abandonment |
| Success | yes / with help / no |
| Errors | number, with a keyword |
| Sticking points | screen and second at which the participant does not know how to continue for more than 10 seconds |
| Quotes | verbatim, short („Wo war das nochmal?“ / "Where was that again?") |
