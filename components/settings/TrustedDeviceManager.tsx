'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Smartphone,
  Laptop,
  Trash2,
  Clock,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  getUserTrustedDevices,
  untrustDevice,
  untrustAllDevices,
  TrustedDeviceInfo,
} from '@/app/lib/auth/trusted-device-actions';
import { TRUSTED_DEVICE_TTL_DAYS } from '@/constants/security';
import { differenceInDays, format, formatDistanceToNow } from 'date-fns';

export default function TrustedDeviceManager() {
  const [devices, setDevices] = useState<TrustedDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const loadDevices = async () => {
    try {
      const result = await getUserTrustedDevices();
      if (result.error) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error,
        });
      } else {
        setDevices(result.devices);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load trusted devices',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleRemoveDevice = async (deviceId: string) => {
    setActionLoading(deviceId);
    try {
      const result = await untrustDevice(deviceId);
      if (result.success) {
        toast({
          title: 'Device Removed',
          description: 'The device has been removed from your trusted devices.',
        });
        await loadDevices();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to remove device',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to remove device',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveAllDevices = async () => {
    setActionLoading('all');
    try {
      const result = await untrustAllDevices();
      if (result.success) {
        toast({
          title: 'All Devices Removed',
          description: 'All trusted devices have been removed.',
        });
        await loadDevices();
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to remove devices',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to remove devices',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDeviceLastUsed = (lastUsedAt: string) => {
    return formatDistanceToNow(new Date(lastUsedAt), { addSuffix: true });
  };

  const formatDeviceExpiry = (expiresAt: string) => {
    return formatDistanceToNow(new Date(expiresAt), { addSuffix: false });
  };

  const formatExpiredLabel = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const daysSince = Math.abs(differenceInDays(expiry, new Date()));
    if (daysSince > 30) return `Expired on ${format(expiry, 'MMM d, yyyy')}`;
    return `Expired ${formatDeviceExpiry(expiresAt)} ago`;
  };

  const getDeviceIcon = (deviceName: string | null) => {
    if (deviceName && /macOS|Windows|Linux/.test(deviceName)) return Laptop;
    return Smartphone;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trusted Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trusted Devices</CardTitle>
        <CardDescription>
          Devices that you&apos;ve chosen to trust for {TRUSTED_DEVICE_TTL_DAYS}{' '}
          days. You won&apos;t need to verify MFA on these devices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {devices.length === 0 ? (
          <Alert>
            <Smartphone className="h-4 w-4" />
            <AlertDescription>
              You don&apos;t have any trusted devices yet. Trust a device after
              MFA verification to skip MFA on that device for{' '}
              {TRUSTED_DEVICE_TTL_DAYS} days.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-3">
              {devices.map((device) => {
                const DeviceIcon = getDeviceIcon(device.deviceName);
                return (
                  <div
                    key={device.id}
                    className="flex items-center justify-between rounded border p-4"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <DeviceIcon className="h-5 w-5 text-foreground" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {device.deviceName || 'Unknown Device'}
                          </p>
                          {device.isExpired ? (
                            <Badge variant="destructive" size="xs">
                              Expired
                            </Badge>
                          ) : (
                            <Badge variant="secondary" size="xs">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>
                              Last logged in{' '}
                              {formatDeviceLastUsed(device.lastUsedAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {device.isExpired
                                ? formatExpiredLabel(device.expiresAt)
                                : `Expires in ${formatDeviceExpiry(device.expiresAt)}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionLoading !== null}
                        >
                          {actionLoading === device.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          <span className="sr-only">Remove device</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remove Trusted Device
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to remove &quot;
                            {device.deviceName || 'this device'}&quot; from your
                            trusted devices? You&apos;ll need to verify MFA on
                            this device again.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRemoveDevice(device.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove Device
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>

            <div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === 'all' ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      'Remove All Devices'
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Remove All Trusted Devices
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {devices.length} trusted devices from
                      your account. You&apos;ll need to verify MFA on all your
                      devices again. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemoveAllDevices}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Remove All Devices
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}

        <div className="rounded-md bg-muted/50 p-3 text-xs">
          <p className="font-medium text-foreground">Security Note</p>
          <p className="mt-0.5 text-muted-foreground">
            Trusted devices are identified using browser fingerprinting. If you
            clear your browser data or use incognito mode, you may need to
            verify MFA again even on trusted devices.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
