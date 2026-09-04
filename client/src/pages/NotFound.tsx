import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-4">
      <Card className="w-full max-w-lg border-white/90 bg-white/90 shadow-xl backdrop-blur-sm">
        <CardContent className="pb-9 pt-9 text-center">
          <div className="mb-6 flex justify-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertCircle className="h-7 w-7" />
            </div>
          </div>

          <h1 className="mb-2 text-4xl font-semibold tracking-[-0.05em] text-gray-900">404</h1>

          <h2 className="mb-4 text-xl font-semibold text-gray-700">
            页面暂时找不到
          </h2>

          <p className="mb-8 leading-relaxed text-gray-500">
            这个地址可能已经移动、删除，或暂时不可访问。
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col justify-center gap-3 sm:flex-row"
          >
            <Button
              onClick={handleGoHome}
              className="px-6"
            >
              <Home className="w-4 h-4 mr-2" />
              返回工作台
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
