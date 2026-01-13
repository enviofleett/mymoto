// Inside MileageSection component
// ... existing useMemos ...

// FIX: Use chartData for both states. 
// If no filter is active, chartData already contains the full dataset 
// because dailyStats (from useVehicleDailyStats) defaults to 30 days in index.tsx
const displayData = chartData.length > 0 ? chartData : [];

return (
  <>
    {/* ... stats cards ... */}

    {/* Mileage Chart */}
    <Card className="...">
      <CardContent className="...">
        {/* ... header ... */}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            {/* FIX: Use displayData consistently */}
            <AreaChart data={displayData}>
              {/* ... chart config ... */}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>

    {/* Trip Activity Chart */}
    <Card className="...">
      <CardContent className="...">
        {/* ... header ... */}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            {/* FIX: Use displayData consistently */}
            <BarChart data={displayData}>
              {/* ... chart config ... */}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* ... stats grid ... */}
      </CardContent>
    </Card>
  </>
);
