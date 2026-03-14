import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useGetTripsReport, useGetDriversReport } from "@workspace/api-client-react";
import { format, subDays } from "date-fns";
import { Download, TrendingUp, Car, Users, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const STATUS_COLORS: Record<string, string> = {
  completed: 'border-emerald-500/30 text-emerald-400',
  in_progress: 'border-yellow-500/30 text-yellow-400',
  scheduled: 'border-blue-500/30 text-blue-400',
  canceled: 'border-red-500/30 text-red-400',
};

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: tripsData, isLoading: tripsLoading } = useGetTripsReport({ startDate, endDate });
  const { data: driversData } = useGetDriversReport({ startDate, endDate });

  const trips = tripsData?.data || [];
  const summary = tripsData?.summary;
  const driverStats = driversData?.data || [];

  const handleExport = () => {
    window.open(`/api/admin/reports/trips?startDate=${startDate}&endDate=${endDate}&format=csv`, '_blank');
  };

  const chartData = (() => {
    const byStatus = {
      completed: 0,
      in_progress: 0,
      scheduled: 0,
      canceled: 0
    };
    trips.forEach((t: any) => {
      if (byStatus.hasOwnProperty(t.status)) {
        byStatus[t.status as keyof typeof byStatus]++;
      }
    });
    return Object.entries(byStatus).map(([name, value]) => ({ name: name.replace('_', ' '), value }));
  })();

  return (
    <PlatformLayout
      title="Reports"
      action={
        <Button onClick={handleExport} variant="outline" className="bg-card border-white/10 rounded-full">
          <Download className="w-4 h-4 mr-2" /> Export CSV
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Date Range */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-white/70 text-sm shrink-0">From</Label>
            <Input type="date" className="bg-card border-white/10 rounded-xl h-9 text-sm w-36"
              value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-white/70 text-sm shrink-0">To</Label>
            <Input type="date" className="bg-card border-white/10 rounded-xl h-9 text-sm w-36"
              value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Trips", value: summary.total, icon: Car, color: "text-primary" },
              { label: "Completed", value: summary.completed, icon: CheckCircle, color: "text-emerald-400" },
              { label: "Canceled", value: summary.canceled, icon: TrendingUp, color: "text-red-400" },
              { label: "Total Revenue", value: `$${(summary.totalFare || 0).toFixed(2)}`, icon: TrendingUp, color: "text-amber-400" },
            ].map((stat) => (
              <Card key={stat.label} className="bg-card border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
                <p className={`text-2xl font-bold font-display ${stat.color}`}>{stat.value}</p>
              </Card>
            ))}
          </div>
        )}

        <Tabs defaultValue="trips">
          <TabsList className="bg-card border border-white/10 rounded-xl mb-4 h-10">
            <TabsTrigger value="trips" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Trips</TabsTrigger>
            <TabsTrigger value="drivers" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Drivers</TabsTrigger>
            <TabsTrigger value="chart" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Chart</TabsTrigger>
          </TabsList>

          <TabsContent value="trips">
            {tripsLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-white/5 animate-pulse rounded-xl" />)}</div>
            ) : trips.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">No trips in this date range</div>
            ) : (
              <Card className="bg-card border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/5">
                      <tr>
                        {['Trip #', 'Date', 'Driver', 'Passengers', 'Status', 'Payment', 'Fare'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {trips.slice(0, 100).map((trip: any) => {
                        const driver = trip.driver ? `${trip.driver.firstName} ${trip.driver.lastName}` : '—';
                        const passengers = [...new Set(trip.stops?.filter((s: any) => s.type === 'pickup').map((s: any) => s.riderName))];
                        return (
                          <tr key={trip._id} className="hover:bg-white/3 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-primary">{trip.tripNumber}</td>
                            <td className="px-4 py-3 text-white/80">{format(new Date(trip.tripDate), 'MM/dd/yy')}</td>
                            <td className="px-4 py-3 text-white/80">{driver}</td>
                            <td className="px-4 py-3 text-white/80">{passengers.join(', ') || '—'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[trip.status] || 'border-white/20 text-white/50'}`}>
                                {trip.status?.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-white/60 text-xs">{trip.payment?.type || '—'}</td>
                            <td className="px-4 py-3 text-white/80">${(trip.payment?.actualFare || 0).toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="drivers">
            <div className="space-y-3">
              {driverStats.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">No driver data in this date range</div>
              ) : driverStats.map((stat: any) => (
                <Card key={stat.driver._id} className="bg-card border-white/5 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary/30 to-blue-500/30 flex items-center justify-center text-white font-bold text-xs">
                        {stat.driver.firstName?.[0]}{stat.driver.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{stat.driver.firstName} {stat.driver.lastName}</p>
                        <p className="text-xs text-muted-foreground">{stat.driver.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-lg font-bold text-white">{stat.totalTrips}</p>
                        <p className="text-xs text-muted-foreground">Total Trips</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-400">{stat.completedTrips}</p>
                        <p className="text-xs text-muted-foreground">Completed</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white">{stat.totalPassengers}</p>
                        <p className="text-xs text-muted-foreground">Passengers</p>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="chart">
            <Card className="bg-card border-white/5 rounded-2xl p-6">
              <CardHeader className="p-0 mb-6">
                <CardTitle className="text-base text-white">Trips by Status</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(224 71% 8%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#94a3b8' }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : index === 3 ? '#ef4444' : '#00D4C8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
}
