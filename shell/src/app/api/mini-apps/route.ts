import { NextResponse } from "next/server";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL


export async function GET() {
  try {
    const response = await fetch(`${BASE_URL}/manifest-registry/registry/mini-apps`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to fetch mini apps.",
        },
        {
          status: response.status,
        },
      );
    }
    const data = await response.json();

    return NextResponse.json(data);
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        message: "Server error while fetching mini apps.",
      },
      {
        status: 500,
      },
    );
  }
}

// export async function POST(request: NextRequest) {
//   try {
//     const { miniAppId, ...body } = await request.json();

//     const response = await fetch(
//       "http://10.10.20.157:3001/v1/service-requests",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "x-app-id": miniAppId,
//         },
//         body: JSON.stringify(body),
//       },
//     );

//     const data = await response.json();

//     return NextResponse.json(data, {
//       status: response.status,
//     });
//   } catch (error) {
//     return NextResponse.json(
//       {
//         success: false,
//         message: "Server error while creating service request.",
//       },
//       {
//         status: 500,
//       },
//     );
//   }
// }
