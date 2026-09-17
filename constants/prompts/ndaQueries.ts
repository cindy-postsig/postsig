import { SchemaType } from '@google/generative-ai';

export const ndaQueries = [
  {
    dbName: 'purpose',
    query: `
**Instruction:**
1.  Identify and extract the Purpose clause from the Non-Disclosure Agreement.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning and the reason for the agreement are accurately preserved.

**Context:**
This section typically describes the fundamental reason for entering into the NDA, outlining the nature of the relationship between the parties and the specific transaction or evaluation for which confidential information is being shared.

**Output Format:**
Return the concise and simple language version of the extracted Purpose clause.

**Example of an extracted clause (for context):**
The Disclosing Party and Receiving Party are considering a potential business relationship concerning the development of a new software application (the "Permitted Purpose").
In connection with the Permitted Purpose, the Disclosing Party may disclose certain confidential and proprietary information to the Receiving Party.

**Example of simplified output:**
Both parties are thinking about working together on a new software project.
This agreement is to share secret information just for this project.
      `,
  },
  {
    dbName: 'confidential_information',
    query: `
**Instruction:**
1.  Identify and extract the clause that defines "Confidential Information."
2.  Rephrase the extracted definition into concise and simple language, ensuring the original meaning and scope of what is considered secret are accurately preserved.

**Context:**
This crucial clause precisely outlines what information is considered confidential and thus protected under the agreement.
It typically includes general and specific examples and specifies whether it covers written, oral, or visual disclosures.

**Output Format:**
Return the concise and simple language version of the extracted "Confidential Information" definition.

**Example of an extracted clause (for context):**
'Confidential Information' means any and all information, whether written, oral, or visual, disclosed by the Disclosing Party to the Receiving Party, including, but not limited to, trade secrets, financial data, marketing plans, product specifications, customer lists, software code, and business strategies, that is designated as confidential or which, by its nature, would reasonably be understood to be confidential.

**Example of simplified output:**
Confidential Information is any secret information one party shares with the other.
This includes things like business secrets, financial details, marketing plans, product designs, customer lists, software code, and business plans.
It applies to information that is written, spoken, or shown, and anything marked 'confidential' or that is obviously private.
      `,
  },
  {
    dbName: 'non_use_non_disclosure',
    query: `
**Instruction:**
1.  Identify and extract the clause detailing the obligations of the receiving party regarding non-use and non-disclosure of confidential information.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning and the core obligations not to use or share the information are accurately preserved.

**Context:**
This clause obliges the receiving party to use the confidential information solely for the purposes explicitly permitted in the agreement and to refrain from disclosing it to any unauthorized third parties.

**Output Format:**
Return the concise and simple language version of the extracted Non-Use/Non-Disclosure clause.

**Example of an extracted clause (for context):**
The Receiving Party agrees to use the Confidential Information solely for the Permitted Purpose and not for any other purpose whatsoever.
The Receiving Party further agrees not to disclose, publish, or disseminate any Confidential Information to any third party without the prior written consent of the Disclosing Party.

**Example of simplified output:**
The party receiving secret information must only use it for the agreed reason and nothing else.
They also must not share, show, or tell this secret information to anyone else unless the party who owns the secret gives written permission first.
      `,
  },
  {
    dbName: 'maintenance_of_confidentiality',
    query: `
**Instruction:**
1.  Identify and extract the section that describes the specific obligations and standard of care required from the receiving party for maintaining the confidentiality of the disclosed information.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning regarding how to protect the information is accurately preserved.

**Context:**
This section often specifies the measures the receiving party must take to safeguard the confidential data, such as using reasonable care and limiting access.

**Output Format:**
Return the concise and simple language version of the extracted Maintenance of Confidentiality clause.

**Example of an extracted clause (for context):**
The Receiving Party shall protect the Confidential Information with the same degree of care it uses to protect its own confidential information of a similar nature, but in no event less than reasonable care.
The Receiving Party shall restrict access to the Confidential Information to those of its employees, directors, and agents who have a need to know such information for the Permitted Purpose and who are bound by confidentiality obligations at least as protective as those contained herein.

**Example of simplified output:**
The party receiving secret information must protect it at least as well as they protect their own important secrets, and always with reasonable care.
Only employees or team members who need to see the information for the agreed reason can access it, and they must also be obligated to keep it secret.
      `,
  },
  {
    dbName: 'term_termination',
    query: `
**Instruction:**
1.  Identify and extract the clause pertaining to the term (duration) of the agreement and how long confidentiality obligations last, including termination conditions.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning regarding the agreement's timeframe and how secrecy obligations continue or end is accurately preserved.

**Context:**
This clause defines how long the NDA is active and how long the confidentiality obligations survive.
It also outlines how the agreement can be ended.

**Output Format:**
Return the concise and simple language version of the extracted Term/Termination clause.

**Example of an extracted clause (for context):**
This Agreement shall become effective on the Effective Date and shall continue in full force and effect for a period of five (5) years thereafter.
Notwithstanding the foregoing, the obligations of confidentiality and non-use with respect to all Confidential Information shall survive the termination or expiration of this Agreement for an indefinite period.

**Example of simplified output:**
This agreement starts on the Effective Date and lasts for five years.
However, the duty to keep secrets and not use them lasts forever, even after these five years are up or the agreement ends for other reasons.
      `,
  },
  {
    dbName: 'no_obligation',
    query: `
**Instruction:**
1.  Identify and extract the clause that specifies what the agreement does *not* obligate either party to do.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning about non-commitment to future deals is accurately preserved.

**Context:**
This clause clarifies that signing the NDA does not force either party to enter into any subsequent business relationship or transaction.

**Output Format:**
Return the concise and simple language version of the extracted No Obligation clause.

**Example of an extracted clause (for context):**
Nothing in this Agreement shall be construed as creating any obligation on the part of either party to enter into any business relationship, agreement, or transaction with the other party, or to disclose any information, or to negotiate or conclude any agreement or transaction.

**Example of simplified output:**
Just because we signed this agreement doesn't mean either of us has to do any future business together, share any more information, or make any deals.
      `,
  },
  {
    dbName: 'no_license_ownership',
    query: `
**Instruction:**
1.  Identify and extract the clause concerning the persistence of property rights and the non-granting of licenses with regard to the confidential information.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning that ownership of secrets doesn't change is accurately preserved.

**Context:**
This clause states that disclosing confidential information does not grant any licenses or ownership rights to the receiving party.

**Output Format:**
Return the concise and simple language version of the extracted No License/Ownership clause.

**Example of an extracted clause (for context):**
All Confidential Information is and shall remain the sole and exclusive property of the Disclosing Party.
Nothing in this Agreement shall be construed as granting any rights, licenses, or intellectual property rights to the Receiving Party, by implication or otherwise, in or to any Confidential Information.

**Example of simplified output:**
All secret information still belongs completely to the party who shared it.
This agreement doesn't give the receiving party any rights, permission to use (licenses), or ownership of the secret information.
      `,
  },
  {
    dbName: 'remedies',
    query: `
**Instruction:**
1.  Identify and extract the clause that describes the entitlements (e.g., legal actions) of either party if confidentiality is breached.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning about consequences for breaking the agreement is accurately preserved.

**Context:**
This clause outlines legal actions available if the agreement is broken, often including the right to ask a court to stop the breach (injunctive relief).

**Output Format:**
Return the concise and simple language version of the extracted Remedies clause.

**Example of an extracted clause (for context):**
The Receiving Party acknowledges that unauthorized disclosure or use of Confidential Information would cause irreparable harm to the Disclosing Party, for which monetary damages would not be an adequate remedy.
Therefore, the Disclosing Party shall be entitled to seek injunctive relief, in addition to any other remedies available at law or in equity, to prevent any actual or threatened breach of this Agreement.

**Example of simplified output:**
If secret information is shared or used wrongly, it can cause serious damage that money can't fix.
So, the party whose secret was misused can ask a court to stop the other party from continuing to misuse it, on top of any other legal options.
      `,
  },
  {
    dbName: 'permitted_use',
    query: `
**Instruction:**
1.  Identify and extract the section detailing the precise purposes for which the confidential information can be used by the receiving party.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning about the limited allowed uses of the information is accurately preserved.

**Context:**
This clause narrowly defines the scope of acceptable use of the confidential information, linking it to the NDA's stated purpose.

**Output Format:**
Return the text of the "Permitted Use" clause.

**Example of an extracted clause (for context):**
The Receiving Party agrees that it will use the Confidential Information solely for the purpose of evaluating a potential strategic partnership with the Disclosing Party and for no other purpose.

**Example of simplified output:**
The party receiving the secret information can only use it to explore a possible partnership with the party who shared it, and for no other reason.
      `,
  },
  {
    dbName: 'no_warranty',
    query: `
**Instruction:**
1.  Identify and extract the clause that addresses warranties (or lack thereof) regarding the nature of the confidential information.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning that the information is provided "as is" is accurately preserved.

**Context:**
This clause typically states that the disclosing party doesn't guarantee the accuracy or completeness of the information provided.

**Output Format:**
Return the concise and simple language version of the extracted No Warranty clause.

**Example of an extracted clause (for context):**
The Disclosing Party makes no representation or warranty, express or implied, as to the accuracy or completeness of the Confidential Information.
All Confidential Information is provided 'AS IS,' and the Disclosing Party shall have no liability whatsoever resulting from the use or reliance upon such information by the Receiving Party.

**Example of simplified output:**
The party sharing the secret information doesn't promise that it's perfectly accurate or complete.
The information is given 'as is,' and the sharing party isn't responsible for any problems if the receiving party uses or relies on it.
      `,
  },
  {
    dbName: 'miscellaneous',
    query: `
**Instruction:**
1.  Identify and extract the "Miscellaneous" or "General Provisions" section of the agreement.
2.  Summarize the key points of the extracted section in concise and simple language, focusing on aspects like governing law, the entire agreement clause, and assignability.
(Full rephrasing might be too long, so a summary of distinct points is better).

**Context:**
This section includes various standard legal clauses governing the contract's operation (e.g., governing law, entire agreement, assignment, notices).

**Output Format:**
Return a concise and simple language summary of the key points in the Miscellaneous section.

**Example of an extracted clause (for context - partial):**
**Governing Law:** This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles.
**Entire Agreement:** This Agreement constitutes the entire understanding between the parties concerning the subject matter hereof and supersedes all prior agreements and understandings.
**Assignment:** Neither party may assign this Agreement without the prior written consent of the other party.

**Example of simplified output:**
General rules for this agreement: It's ruled by Delaware law.
This document is the complete agreement, replacing any past talks.
Neither side can transfer this agreement to someone else without written permission from the other.
      `,
  },
  {
    dbName: 'exclusions_exceptions',
    query: `
**Instruction:**
1.  Identify and extract any clause(s) that describe information explicitly *not* covered by the confidentiality obligations.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning of what is *not* considered secret is accurately preserved.

**Context:**
This clause defines information that isn't bound by the NDA, such as publicly known information or independently developed information.

**Output Format:**
Return the concise and simple language version of the extracted Exclusions/Exceptions clause.

**Example of an extracted clause (for context):**
The obligations of confidentiality under this Agreement shall not apply to any information that: (a) is or becomes publicly known through no fault of the Receiving Party; (b) was lawfully known to the Receiving Party prior to disclosure by the Disclosing Party; (c) is disclosed to the Receiving Party by a third party who has a lawful right to make such disclosure; or (d) is independently developed by the Receiving Party without reference to the Confidential Information.

**Example of simplified output:**
The duty to keep things secret doesn't apply if: (a) the information is already public or becomes public without the receiver's fault; (b) the receiver already knew it legally before it was shared; (c) the receiver legally got it from someone else who had the right to share it; or (d) the receiver created the information themselves without using the shared secrets.
      `,
  },
  {
    dbName: 'disclosure_required_by_law',
    query: `
**Instruction:**
1.  Identify and extract the clause describing the process if a party is legally forced to disclose confidential information.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning about legal compulsion and notification is accurately preserved.

**Context:**
This clause outlines steps if a party must disclose information due to a law or court order, often requiring notice to the other party.

**Output Format:**
Return the concise and simple language version of the extracted Disclosure Required By Law clause.

**Example of an extracted clause (for context):**
In the event that the Receiving Party is required by law, regulation, or court order to disclose any Confidential Information, the Receiving Party shall, to the extent legally permissible, provide the Disclosing Party with prompt written notice of such requirement prior to disclosure so that the Disclosing Party may seek a protective order or other appropriate remedy.

**Example of simplified output:**
If the party receiving secrets is forced by law or a court to share them, they must quickly tell the other party in writing (if allowed by law) before sharing.
This gives the original owner a chance to try and protect the information.
      `,
  },
  {
    dbName: 'non_solicitation_of_employees',
    query: `
**Instruction:**
1.  Identify and extract any clause that prohibits or restricts the parties from hiring or trying to hire each other's employees.
2.  Rephrase the extracted clause into concise and simple language, ensuring the original meaning and scope of the hiring restriction are accurately preserved.

**Context:**
This clause aims to prevent parties from "poaching" each other's employees involved with the confidential information or project.

**Output Format:**
Return the concise and simple language version of the extracted Non-Solicitation of Employees clause.

**Example of an extracted clause (for context):**
During the term of this Agreement and for a period of one (1) year following its termination, neither party shall directly or indirectly solicit, induce, recruit, or attempt to solicit, induce, or recruit for employment any employee of the other party who was involved in the Permitted Purpose or had access to Confidential Information hereunder.

**Example of simplified output:**
While this agreement is active and for one year after it ends, neither party can try to hire any employee from the other party if that employee worked on the project or saw the secret information.
      `,
  },
  {
    dbName: 'mutual_nda',
    query: `
**Instruction:**
1.  Analyze the agreement to determine if it is a Mutual (bilateral) NDA or a Unilateral (one-way) NDA.
2.  Identify key phrasing that indicates whether one or both parties are disclosing and receiving confidential information under obligations.

**Context:**
A Mutual NDA binds both parties to protect each other's disclosures.
A Unilateral NDA binds only one receiving party.

**Output Format:**
Respond with 'YES' if it is a Mutual NDA (both parties disclose and protect).
Respond with 'NO' if it is a Unilateral NDA (one party discloses, the other protects).

**Example of phrasing indicating 'YES' (Mutual):**
Each Party (as a Disclosing Party) may disclose Confidential Information to the other Party (as a Receiving Party).
Both Parties agree to the obligations herein with respect to Confidential Information received from the other.

**Example of phrasing indicating 'NO' (Unilateral):**
The Disclosing Party will disclose Confidential Information to the Receiving Party.
The Receiving Party agrees to the obligations herein with respect to such Confidential Information.
      `,
  },
  {
    dbName: 'extended_confidentiality_period',
    query: `
**Instruction:**
1.  Identify and extract the specific clause or phrase from the Non-Disclosure Agreement that describes how long the duty to keep information confidential continues *after* the main agreement ends (i.e., the survival period of confidentiality obligations).
2.  Determine the duration of this extended confidentiality period.
3.  Convert this duration into a total number of months.
    - If the period is stated in years, multiply by 12.
    - If the period is stated in months, use that number directly.
    - If the period is described as "indefinite", "perpetual", or similar, the output should be the specific string "Indefinite".
    - If the clause states that confidentiality obligations cease upon termination of the main agreement, or if no specific extended period beyond the main agreement's term is mentioned for the survival of confidentiality obligations, the output should be the specific string "0".

**Context:**
This clause outlines the additional period for which the confidentiality obligations continue after the termination or expiration of the agreement itself.
It is distinct from the main "Term" of the agreement.
Look for phrases like "survive termination for...", "obligations shall continue for X years/months after expiration", "remain in effect for...", "indefinitely", etc., specifically in relation to confidentiality duties post-agreement.

**Output Format:**
Return only the total number of months as an integer (e.g., '36') OR nothing. Do not include the word "months" in the numerical output.

**Example of an extracted clause (for context):**
"The obligations of confidentiality and non-use with respect to all Confidential Information shall survive the termination or expiration of this Agreement for an additional period of three (3) years."
"Confidentiality obligations hereunder shall remain in effect for twenty-four (24) months following the termination or expiration of this Agreement."
"The provisions of Clause X (Confidentiality) shall continue in force indefinitely."
"All obligations of confidentiality shall cease upon termination of this Agreement."

**Example of required output:**
'36'
'24'
`,
  },
  {
    dbName: 'perpetual_nda',
    query: `
**Instruction:**
1.  Analyze the Non-Disclosure Agreement to determine if it is a perpetual NDA (ongoing with no specified end date).
2.  Look for clauses that indicate the agreement has no termination date or continues indefinitely.

**Context:**
A perpetual NDA is one that continues indefinitely without a specified end date for the agreement itself.
This is different from confidentiality obligations that survive termination - this refers to the main agreement having no end date.

**Output Format:**
Respond with 'YES' if the NDA is perpetual (no specified end date).
Respond with 'NO' if the NDA has a specified term or end date.

**Example of phrasing indicating 'YES' (Perpetual):**
This Agreement shall remain in effect indefinitely.
This Agreement shall continue in perpetuity.
No termination date is specified for this Agreement.

**Example of phrasing indicating 'NO' (Non-Perpetual):**
This Agreement shall terminate on [date].
This Agreement shall continue for a period of [X] years.
Either party may terminate this Agreement with [X] days notice.
      `,
    type: SchemaType.BOOLEAN,
  },
  {
    dbName: 'unilateral_nda',
    query: `
**Instruction:**
1.  Analyze the agreement to determine if it is a Unilateral (one-way) NDA where only one party is obligated to maintain confidentiality.
2.  Identify key phrasing that indicates only one party (the receiving party) has confidentiality obligations.

**Context:**
A Unilateral NDA obligates only the receiving party to protect confidential information disclosed by the disclosing party.
In contrast, a Mutual NDA obligates both parties to protect each other's confidential information.

**Output Format:**
Respond with 'YES' if it is a Unilateral NDA (only one party has confidentiality obligations).
Respond with 'NO' if it is a Mutual NDA (both parties have confidentiality obligations).

**Example of phrasing indicating 'YES' (Unilateral):**
The Receiving Party agrees to hold in confidence all Confidential Information disclosed by the Disclosing Party.
Only the Receiving Party shall be bound by the confidentiality obligations herein.
The Disclosing Party will share information with the Receiving Party under the terms of this Agreement.

**Example of phrasing indicating 'NO' (Mutual):**
Each Party may disclose Confidential Information to the other Party.
Both Parties agree to maintain confidentiality of information received from the other.
The Parties mutually agree to protect each other's confidential information.
      `,
    type: SchemaType.BOOLEAN,
  },
  {
    dbName: 'uncapped_liability',
    query: `
**Instruction:**
1.  Identify and analyze clauses related to liability, damages, and monetary limits in the Non-Disclosure Agreement.
2.  Determine if there are any caps or limits on the monetary damages or liabilities that can be incurred.

**Context:**
Uncapped liability means there is no upward limit on monetary damages or other liabilities that can be incurred by one or both parties for breach of the agreement.
Look for liability limitation clauses, damage caps, or exclusions of certain types of damages.

**Output Format:**
Respond with 'YES' if the NDA has uncapped liability (no limits on damages/liability).
Respond with 'NO' if the NDA has capped liability (specific limits on damages/liability are mentioned).

**Example of phrasing indicating 'YES' (Uncapped Liability):**
The breaching party shall be liable for all damages arising from breach of this Agreement.
No limitation is placed on the damages recoverable for breach of confidentiality.
The parties acknowledge that breach may cause irreparable harm for which monetary damages may not be adequate.

**Example of phrasing indicating 'NO' (Capped Liability):**
Liability under this Agreement shall not exceed $[amount].
In no event shall either party's liability exceed [specified limit].
Damages are limited to direct damages only and exclude consequential damages.
      `,
    type: SchemaType.BOOLEAN,
  },
  {
    dbName: 'post_end_of_term_obligations',
    query: `
**Instruction:**
1.  Identify and analyze clauses that describe obligations continuing after the main agreement terminates or expires.
2.  Determine if there are any obligations (beyond just confidentiality) that survive the end of the agreement term.

**Context:**
Post end of term obligations refer to any duties or responsibilities that continue after the main NDA terminates.
This includes but is not limited to confidentiality obligations, return of materials, non-use obligations, or other continuing duties.

**Output Format:**
Respond with 'YES' if the NDA has post end of term obligations (obligations continue after agreement ends).
Respond with 'NO' if all obligations cease when the agreement terminates.

**Example of phrasing indicating 'YES' (Post End Term Obligations):**
The obligations under Sections [X] shall survive termination of this Agreement.
Upon termination, the Receiving Party shall return all confidential materials and continue to maintain confidentiality.
Certain provisions of this Agreement shall remain in effect after termination.

**Example of phrasing indicating 'NO' (No Post End Term Obligations):**
All obligations under this Agreement shall cease upon termination.
This Agreement and all obligations hereunder shall terminate on the expiration date.
No obligations survive the termination of this Agreement.
      `,
    type: SchemaType.BOOLEAN,
  },
  {
    dbName: 'foreign_jurisdiction',
    query: `
**Instruction:**
1.  Identify and analyze the governing law and jurisdiction clauses in the Non-Disclosure Agreement.
2.  Determine if any controversies or disputes will be adjudicated outside of the United States.

**Context:**
Foreign jurisdiction refers to legal disputes being resolved in courts or under laws outside the United States.
Look for governing law clauses, jurisdiction clauses, venue provisions, or dispute resolution mechanisms that specify non-US locations.

**Output Format:**
Respond with 'YES' if the NDA stipulates foreign jurisdiction (disputes resolved outside the US).
Respond with 'NO' if the NDA specifies US jurisdiction or is silent on jurisdiction.

**Example of phrasing indicating 'YES' (Foreign Jurisdiction):**
This Agreement shall be governed by the laws of [non-US country].
Disputes shall be resolved in the courts of [non-US location].
Any legal proceedings shall be conducted in [foreign jurisdiction].

**Example of phrasing indicating 'NO' (US Jurisdiction):**
This Agreement shall be governed by the laws of [US state].
Disputes shall be resolved in US federal or state courts.
The parties consent to jurisdiction in [US location].
      `,
    type: SchemaType.BOOLEAN,
  },
  {
    dbName: 'no_carve_out_provisions',
    query: `
**Instruction:**
1.  Analyze the Non-Disclosure Agreement to identify if there are exclusions or exceptions that define what does NOT constitute confidential information.
2.  Determine if the agreement lacks standard carve-out provisions that typically exclude certain types of information from confidentiality obligations.

**Context:**
Carve-out provisions (also called exclusions or exceptions) specify what information is NOT considered confidential.
Standard carve-outs typically include: publicly known information, independently developed information, lawfully obtained from third parties, or information compelled to be disclosed by courts.
An NDA without these provisions may be overly broad.

**Output Format:**
Respond with 'YES' if the NDA lacks carve-out provisions (fails to specify what is NOT confidential).
Respond with 'NO' if the NDA includes standard carve-out provisions (specifies exclusions from confidentiality).

**Example of phrasing indicating 'YES' (No Carve-Out Provisions):**
All information disclosed shall be considered confidential.
The Receiving Party shall maintain confidentiality of any and all information received.
No exceptions or exclusions are specified for confidential information.

**Example of phrasing indicating 'NO' (Has Carve-Out Provisions):**
Confidential information does not include information that: (a) is publicly known, (b) was independently developed, (c) was lawfully obtained from third parties.
The obligations herein shall not apply to information that is in the public domain.
Excluded from confidential information is any information that the Receiving Party can demonstrate was known prior to disclosure.
      `,
    type: SchemaType.BOOLEAN,
  },
  {
    dbName: 'non_solicitation',
    query: `
## Instruction
Determine if the provided Non-Disclosure Agreement (NDA) contains a clause that restricts one or both parties from soliciting (or "poaching") employees or contractors from the other party.

## Context
A non-solicitation clause is a provision that contractually prohibits one or both parties from trying to hire the other party's employees. Your task is to identify if *any* such restriction exists. These clauses can be **unilateral** (restricting only one party) or **mutual** (restricting both parties). The presence of either type should result in a 'YES'.

## Output Format
Respond with 'YES' if the NDA includes a non-solicitation provision.  
Respond with 'NO' if the NDA does not include any non-solicitation provisions.

## Examples

### Respond with 'YES' if you find text similar to the following:

*   **Mutual Non-Solicitation:**
    > "During the term of this Agreement and for a period of one (1) year thereafter, neither party shall directly or indirectly solicit for employment any employee of the other party."

*   **Unilateral Non-Solicitation:**
    > "The Receiving Party agrees that it will not, for the term of this Agreement and for two (2) years after its termination, solicit or attempt to hire any employee of the Disclosing Party."

### Respond with 'NO' in the following situations:

*   The document contains **no clause** mentioning the solicitation of employees.
*   The document **explicitly permits** solicitation, for example:
    > "Nothing in this Agreement shall be construed to restrict either party from soliciting for employment any employee of the other party."
      `,
    type: SchemaType.BOOLEAN,
  },
];
