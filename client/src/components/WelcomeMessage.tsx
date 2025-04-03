import { Card, CardContent } from "@/components/ui/card";
import { CheckIcon } from "lucide-react";

export default function WelcomeMessage() {
  return (
    <div className="px-4 py-6 sm:px-0">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-medium text-neutral-900 mb-4">Welcome to TradeConnect</h2>
          <p className="text-sm text-neutral-600 mb-4">
            Connect to multiple trading exchanges and brokers from a single platform. Trade across various markets including equity, crypto, forex, commodities, and metals.
          </p>
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center text-sm text-neutral-700">
              <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
              <span>Multiple exchanges</span>
            </div>
            <div className="flex items-center text-sm text-neutral-700">
              <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
              <span>Broker integration</span>
            </div>
            <div className="flex items-center text-sm text-neutral-700">
              <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
              <span>Multi-market trading</span>
            </div>
            <div className="flex items-center text-sm text-neutral-700">
              <CheckIcon className="h-5 w-5 text-green-500 mr-2" />
              <span>Secure authentication</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
