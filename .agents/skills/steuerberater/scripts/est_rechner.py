#!/usr/bin/env python3
"""Einkommensteuer-Rechner nach § 32a EStG mit Soli (SolZG) und Kirchensteuer.

Tarifkoeffizienten 2022–2026 gegen den BMF-Steuerrechner verifiziert
(https://www.bmf-steuerrechner.de/ekst/eingabeformekst.xhtml).

Beispiele:
  est_rechner.py --jahr 2025 --zve 48000
  est_rechner.py --jahr 2025 --zve 90000 --splitting --kist 0.09
  est_rechner.py --jahr 2026 --zve 48000 --mehrabzug 1500
"""
import argparse
import json
import math

# Jahr: (Grundfreibetrag, Zone2-Ende, c2a, Zone3-Ende, c3a, c3const, Zone4-Abzug, Zone5-Abzug)
TARIF = {
    2022: (10347, 14926, 1088.67, 58596, 206.43, 869.32, 9336.45, 17671.20),
    2023: (10908, 15999, 979.18, 62809, 192.59, 966.53, 9972.98, 18307.73),
    2024: (11784, 17005, 954.80, 66760, 181.19, 991.21, 10636.31, 18971.06),
    2025: (12096, 17443, 932.30, 68480, 176.64, 1015.13, 10911.92, 19246.67),
    2026: (12348, 17799, 914.51, 69878, 173.10, 1034.87, 11135.63, 19470.38),
}
ZONE4_ENDE = 277825

# Soli-Freigrenze (§ 3 Abs. 3 SolZG) auf die tarifliche ESt: (Einzel, Zusammen)
SOLI_FREIGRENZE = {
    2022: (16956, 33912),
    2023: (17543, 35086),
    2024: (18130, 36260),
    2025: (19950, 39900),
    2026: (20350, 40700),
}


def grundtarif(zve: float, jahr: int) -> int:
    gfb, z2, c2, z3, c3, k3, s4, s5 = TARIF[jahr]
    x = math.floor(zve)
    if x <= gfb:
        est = 0.0
    elif x <= z2:
        y = (x - gfb) / 10000
        est = (c2 * y + 1400) * y
    elif x <= z3:
        z = (x - z2) / 10000
        est = (c3 * z + 2397) * z + k3
    elif x <= ZONE4_ENDE:
        est = 0.42 * x - s4
    else:
        est = 0.45 * x - s5
    return math.floor(est)


def tarif_est(zve: float, jahr: int, splitting: bool) -> int:
    if splitting:
        return 2 * grundtarif(math.floor(zve) / 2, jahr)
    return grundtarif(zve, jahr)


def soli(est: int, jahr: int, splitting: bool) -> float:
    grenze = SOLI_FREIGRENZE[jahr][1 if splitting else 0]
    if est <= grenze:
        return 0.0
    return math.floor(min(0.055 * est, 0.119 * (est - grenze)) * 100) / 100


def berechne(zve: float, jahr: int, splitting: bool, kist: float) -> dict:
    est = tarif_est(zve, jahr, splitting)
    so = soli(est, jahr, splitting)
    ki = round(est * kist, 2)
    gesamt = est + so + ki
    # Grenzsteuersatz numerisch über +100 € (inkl. Soli/KiSt)
    est2 = tarif_est(zve + 100, jahr, splitting)
    gesamt2 = est2 + soli(est2, jahr, splitting) + est2 * kist
    return {
        "jahr": jahr,
        "zvE": math.floor(zve),
        "veranlagung": "Zusammen (Splitting)" if splitting else "Einzel (Grundtarif)",
        "einkommensteuer": est,
        "soli": so,
        "kirchensteuer": ki,
        "gesamt": round(gesamt, 2),
        "durchschnittssatz_prozent": round(100 * gesamt / zve, 2) if zve > 0 else 0.0,
        "grenzsatz_prozent": round((gesamt2 - gesamt), 2),
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--jahr", type=int, required=True, choices=sorted(TARIF))
    p.add_argument("--zve", type=float, required=True, help="zu versteuerndes Einkommen in €")
    p.add_argument("--splitting", action="store_true", help="Zusammenveranlagung (Splittingtarif)")
    p.add_argument("--kist", type=float, default=0.0, help="Kirchensteuersatz: 0, 0.08 (BY/BW) oder 0.09")
    p.add_argument("--mehrabzug", type=float, default=0.0, help="zusätzlicher Abzug in €: zeigt die Ersparnis")
    p.add_argument("--json", action="store_true")
    a = p.parse_args()

    basis = berechne(a.zve, a.jahr, a.splitting, a.kist)
    out = {"basis": basis}
    if a.mehrabzug:
        neu = berechne(max(0.0, a.zve - a.mehrabzug), a.jahr, a.splitting, a.kist)
        out["mit_mehrabzug"] = neu
        out["ersparnis"] = round(basis["gesamt"] - neu["gesamt"], 2)

    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return
    b = basis
    print(f"Steuerjahr {b['jahr']} · {b['veranlagung']} · zvE {b['zvE']:,} €".replace(",", "."))
    print(f"  Einkommensteuer : {b['einkommensteuer']:>12,.2f} €")
    print(f"  Soli            : {b['soli']:>12,.2f} €")
    print(f"  Kirchensteuer   : {b['kirchensteuer']:>12,.2f} €")
    print(f"  Gesamt          : {b['gesamt']:>12,.2f} €")
    print(f"  Durchschnitt    : {b['durchschnittssatz_prozent']:>11.2f} %")
    print(f"  Grenzsteuersatz : {b['grenzsatz_prozent']:>11.2f} %  (je weiterem Euro, inkl. Soli/KiSt)")
    if a.mehrabzug:
        print(f"Mehrabzug {a.mehrabzug:,.2f} € spart {out['ersparnis']:,.2f} €")


if __name__ == "__main__":
    main()
