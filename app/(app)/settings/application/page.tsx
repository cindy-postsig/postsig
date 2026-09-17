import { getUserMetadata } from '@/data/users';
import FiscalYearForm from '@/components/settings/FiscalYear';
import MissingClausesSettings from '@/components/settings/MissingClausesSettings';
import CostCalculationMethodSetting from '@/components/settings/CostCalculationMethod';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { getOrgPreference } from '@/app/lib/actions/org-preferences';
import { resolveCostCalculationMethod } from '@/lib/settings/cost-calculation-method';

export default async function Application() {
  const userMetadata = await getUserMetadata();
  const organizationId = userMetadata?.organizationId;
  const costCalculationMethod = resolveCostCalculationMethod(
    organizationId
      ? await getOrgPreference(
          organizationId,
          'reporting.cost_calculation_method',
        )
      : null,
  );

  return (
    <SettingsPage className="space-y-6">
      <div>
        <h3 className="font-medium">Application</h3>
        <p className="text-sm text-muted-foreground">
          Configure global application settings for your organization.
        </p>
      </div>
      <Separator />
      <div className="space-y-6">
        <div>
          <Card>
            <CardContent className="flex items-center justify-between gap-2 p-5">
              <div className="flex flex-col gap-1">
                <label className="font-medium font-sans">Fiscal Year</label>
                <p className="text-sm text-muted-foreground">
                  PostSig uses the calendar year by default.
                </p>
              </div>
              <FiscalYearForm user={userMetadata} />
            </CardContent>
          </Card>
        </div>
        {organizationId && (
          <div>
            <Card>
              <CardContent className="flex items-center justify-between gap-2 p-5">
                <div className="flex flex-col gap-1">
                  <label className="font-medium font-sans">
                    Default Cost Calculation Method
                  </label>
                  <p className="max-w-2xl text-sm leading-snug text-muted-foreground">
                    Select the method PostSig should use by default when
                    displaying current, projected, and historical spend. Users
                    may switch methods within supported reports and charts.
                  </p>
                </div>
                <CostCalculationMethodSetting
                  organizationId={organizationId}
                  initialMethod={costCalculationMethod}
                />
              </CardContent>
            </Card>
          </div>
        )}
        <div>
          <Card id="contract-omissions">
            <CardContent className="p-5">
              <div className="mb-6 flex flex-col gap-1">
                <label className="font-medium font-sans">
                  Required Contract Clauses
                </label>
                <p className="max-w-2xl text-sm leading-snug text-muted-foreground">
                  Customize which contract clauses are important to your
                  organization. These settings determine what appears in the
                  Contract Omissions report.
                </p>
              </div>

              <MissingClausesSettings user={userMetadata} compact={true} />
            </CardContent>
          </Card>
        </div>
      </div>
    </SettingsPage>
  );
}
