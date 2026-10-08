// THE LICENCE GATE OF THE PUBLIC CATALOGUE (2026-10-07, Wave 1 — X-11). A declared licence is not enough: a dataset is
// importable only when its owner published it under a licence NEXUM recognises as open (public domain, CC0, CC BY or
// CC BY-SA, the Open Data Commons and government open licences). Any sign of a restriction — the Esri Master License
// Agreement, "all rights reserved", proprietary, non-commercial, no derivatives, permission required — closes the gate,
// even next to an open name. Unrecognised text closes it too: the owner's page stays one tap away.

const RESTRICTED: [RegExp, string][] = [
  [/master\s+licen[cs]e\s+agreement|\besri\s+(terms|licen[cs]e)/i, "licenza proprietaria Esri"],
  [/all\s+rights\s+reserved|tutti\s+i\s+diritti\s+riservati|todos\s+los\s+derechos\s+reservados|droits\s+r[ée]serv[ée]s/i, "tutti i diritti riservati"],
  [/proprietar|propriet[àa]\s+riservat/i, "licenza proprietaria"],
  [/non[\s-]?commercial|noncommercial|\bby[\s-]nc\b|\bnc[\s-](sa|nd)\b|\bcc[\s-]?by[\s-]?nc|uso\s+non\s+commerciale/i, "solo uso non commerciale"],
  [/no[\s-]?deriv|\bby[\s-]nd\b|\bcc[\s-]?by[\s-]?(nc[\s-]?)?nd\b|non\s+opere\s+derivate/i, "nessuna opera derivata"],
  [/permission\s+(is\s+)?required|written\s+permission|prior\s+(written\s+)?(consent|approval)|not\s+(be\s+)?(re)?distribut|internal\s+use\s+only|for\s+official\s+use|autorizzazione\s+(scritta|preventiva)/i, "serve un permesso"],
];
const OPEN: [RegExp, string][] = [
  [/\bcc0\b|creativecommons\.org\/publicdomain\/zero|creative\s+commons\s+zero/i, "CC0"],
  [/public\s+domain|pubblico\s+dominio|dominio\s+pubblico|creativecommons\.org\/publicdomain\/mark/i, "pubblico dominio"],
  [/\bpddl\b|opendatacommons\.org\/licenses\/pddl/i, "ODC PDDL"],
  [/\bodbl\b|open\s+database\s+licen[cs]e|opendatacommons\.org\/licenses\/odbl/i, "ODbL"],
  [/\bodc[\s-]by\b|opendatacommons\.org\/licenses\/by/i, "ODC-By"],
  [/\bcc[\s-]?by[\s-]?sa\b|creativecommons\.org\/licenses\/by-sa\/|attribution[\s-]+share[\s-]?alike/i, "CC BY-SA"],
  [/\bcc[\s-]?by\b|creativecommons\.org\/licenses\/by\/|creative\s+commons\s+attribu(tion|zione)/i, "CC BY"],
  [/open\s+government\s+licen[cs]e|\bogl\b/i, "Open Government Licence"],
  [/\biodl\b|italian\s+open\s+data\s+licen[cs]e/i, "IODL"],
  [/licence\s+ouverte|open\s+licen[cs]e\s+etalab|\betalab\b/i, "Licence Ouverte (Etalab)"],
  [/\bdl-de[\s/-](by|zero)\b|datenlizenz\s+deutschland/i, "Datenlizenz Deutschland"],
];

export type LicenceVerdict = { open: true; name: string } | { open: false; why: string };

/** The verdict on a licence text as the owner declared it (HTML already stripped). */
export function licenceVerdict(text: string | null | undefined): LicenceVerdict {
  const t = String(text ?? "").trim();
  if (!t) return { open: false, why: "licenza non dichiarata" };
  for (const [re, why] of RESTRICTED) if (re.test(t)) return { open: false, why };
  for (const [re, name] of OPEN) if (re.test(t)) return { open: true, name };
  return { open: false, why: "licenza non riconosciuta come aperta" };
}
