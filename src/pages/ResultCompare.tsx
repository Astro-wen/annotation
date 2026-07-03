import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Layout from "@/components/Layout";

export default function ResultCompare() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
        <button onClick={() => navigate("/audit")} className="flex items-center gap-1.5 text-sm font-medium text-subtle hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Back to Audit
        </button>
      </div>
      <div className="p-6">
        <div className="rounded-xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold text-ink">AB compare 已下线</h2>
          <p className="mt-2 text-sm text-subtle">
            现在的流程里，A / B 只属于标注前置阶段，不再通过单独的 portal 做 compare / alignment。
            Audit Portal 只保留 C sample QC。
          </p>
        </div>
      </div>
    </Layout>
  );
}
