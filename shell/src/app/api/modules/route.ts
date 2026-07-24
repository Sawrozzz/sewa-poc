import { NextResponse } from 'next/server';
import {
  addModule,
  getAllModules,
  getModuleById,
  moduleExists,
  removeModuleById,
  updateModuleById,
} from '@/lib/modules-store';
import {
  type MiniAppModule,
  type ApiResponse,
  type ModuleRegistrationRequest,
} from '@/types/modules';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ===================== GET /api/modules =====================

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    const module = getModuleById(id);
    const response: ApiResponse<MiniAppModule> = module
      ? { success: true, data: module }
      : { success: false, error: 'Module not found' };
    return NextResponse.json(response, { headers: corsHeaders() });
  }

  const response: ApiResponse<MiniAppModule[]> = {
    success: true,
    data: getAllModules(),
  };
  return NextResponse.json(response, { headers: corsHeaders() });
}

// ===================== POST /api/modules =====================

export async function POST(request: Request) {
  try {
    const body: ModuleRegistrationRequest = await request.json();

    const routeParts = body.route.split('/').filter(Boolean);
    const id =
      routeParts[routeParts.length - 1] ||
      body.route.replace(/[^a-z0-9]/g, '-').replace(/^-+|-+$/g, '');

    if (moduleExists(id)) {
      const response: ApiResponse<never> = {
        success: false,
        error: `Module with route '${body.route}' already exists`,
      };
      return NextResponse.json(response, { status: 409, headers: corsHeaders() });
    }

    const newModule: MiniAppModule = {
      ...body,
      id,
      isEnabled: true,
      order: getAllModules().length + 1,
      createdAt: new Date().toISOString(),
    };

    addModule(newModule);

    const response: ApiResponse<MiniAppModule> = {
      success: true,
      data: newModule,
    };
    return NextResponse.json(response, { status: 201, headers: corsHeaders() });
  } catch {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Invalid request body',
    };
    return NextResponse.json(response, { status: 400, headers: corsHeaders() });
  }
}

// ===================== PUT /api/modules =====================

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    const updated = updateModuleById(id, updates);
    if (!updated) {
      const response: ApiResponse<never> = {
        success: false,
        error: 'Module not found',
      };
      return NextResponse.json(response, { status: 404, headers: corsHeaders() });
    }

    const response: ApiResponse<MiniAppModule> = {
      success: true,
      data: updated,
    };
    return NextResponse.json(response, { headers: corsHeaders() });
  } catch {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Invalid request',
    };
    return NextResponse.json(response, { status: 400, headers: corsHeaders() });
  }
}

// ===================== DELETE /api/modules =====================

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Module ID required',
    };
    return NextResponse.json(response, { status: 400, headers: corsHeaders() });
  }

  if (!removeModuleById(id)) {
    const response: ApiResponse<never> = {
      success: false,
      error: 'Module not found',
    };
    return NextResponse.json(response, { status: 404, headers: corsHeaders() });
  }

  const response: ApiResponse<{ deleted: true }> = {
    success: true,
    data: { deleted: true },
  };
  return NextResponse.json(response, { headers: corsHeaders() });
}
