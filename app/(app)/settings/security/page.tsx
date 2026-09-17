import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default async function SecurityPage() {
  return <></>;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium">Security</h3>
        <p className="text-sm text-muted-foreground">
          Configure organization-wide security policies and authentication
          requirements.
        </p>
      </div>
      <Separator />
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="font-medium">
                  Require Multi-Factor Authentication
                </div>
                <div className="text-sm text-muted-foreground">
                  Force all organization members to enable MFA
                </div>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
