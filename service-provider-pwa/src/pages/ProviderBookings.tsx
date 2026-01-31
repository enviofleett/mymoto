import { Button } from '@/components/ui/button';

const ProviderBookings = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-blue-900">Bookings</h1>
          <Button variant="outline" onClick={() => window.history.back()}>
            Back to Dashboard
          </Button>
        </div>
        <div className="bg-white p-8 rounded-xl shadow text-center">
          <p className="text-gray-500">Booking management coming soon...</p>
        </div>
      </div>
    </div>
  );
};

export default ProviderBookings;
