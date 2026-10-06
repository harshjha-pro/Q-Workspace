import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/server/lib/dates";
import type { getEmployeeProfile } from "@/server/services/employees/service";

type Profile = NonNullable<Awaited<ReturnType<typeof getEmployeeProfile>>>;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

/** Employee record. PAN / bank appear only for HR, Partners and the person; Aadhaar is always masked. */
export function ProfileView({ p, action }: { p: Profile; action?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>Employee record · {p.employeeCode}</CardTitle>{action}</CardHeader>
      <CardContent className="grid gap-x-8 sm:grid-cols-2">
        <div>
          <Row label="Category" value={p.employeeCategory.toLowerCase()} />
          <Row label="Joined" value={formatDate(p.joiningDate)} />
          <Row label="Confirmed" value={formatDate(p.confirmationDate)} />
          <Row label="Date of birth" value={formatDate(p.dateOfBirth)} />
          <Row label="Qualifications" value={p.qualifications} />
          <Row label="Membership" value={p.membershipBody ? `${p.membershipBody} ${p.membershipNo ?? ""}` : null} />
          <Row label="Work state (PT)" value={p.workStateCode} />
        </div>
        <div>
          <Row label="Personal email" value={p.personalEmail} />
          <Row label="Personal mobile" value={p.personalMobile} />
          <Row label="Emergency contact" value={[p.emergencyName, p.emergencyPhone].filter(Boolean).join(" · ")} />
          <Row label="UAN / ESI" value={[p.uan, p.esiNumber].filter(Boolean).join(" / ")} />
          <Row label="Aadhaar" value={p.aadhaarMasked} />
          {p.canSeePii ? (
            <>
              <Row label="PAN" value={<span className="font-mono">{p.pan}</span>} />
              <Row label="Bank" value={[p.bankName, p.bankAccount, p.bankIfsc].filter(Boolean).join(" · ")} />
            </>
          ) : (
            <Row label="PAN / bank" value={<span className="text-muted">restricted</span>} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
