import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/material_kind_model.dart';
import '../models/material_type_model.dart';
import '../services/api/api_service.dart';

/// Provider para lista de material kinds
final materialKindsProvider = FutureProvider<List<MaterialKindResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getMaterialKinds(limit: 1000);
});

/// Provider para lista de material types
final materialTypesProvider = FutureProvider<List<MaterialTypeResponse>>((ref) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getMaterialTypes(limit: 1000);
});

/// Provider para buscar material type por ID
final materialTypeByIdProvider = FutureProvider.family<MaterialTypeResponse, String>((ref, typeId) async {
  final apiService = ref.read(apiServiceProvider);
  return await apiService.getMaterialType(typeId);
});
