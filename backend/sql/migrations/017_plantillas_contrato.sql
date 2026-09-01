-- 017 · Las plantillas de contrato.
--
-- Sin esto no se puede generar ningún contrato: `contratos.generar` busca una
-- plantilla vigente para el marco legal de la unidad y falla si no la
-- encuentra. La tabla existía desde la migración 003 pero nunca se sembró.
--
-- El cuerpo usa marcadores {{ }} que se reemplazan al generar. Se guardan como
-- dato y no como archivo del repositorio para que un cambio de cláusula sea una
-- edición desde la administración y no un despliegue — que es lo que hace falta
-- cuando cambia la ley.
--
-- ADVERTENCIA: son un punto de partida redactado a partir de la Ley 820 de
-- 2003 y del Código Civil, NO un contrato revisado por abogado. Antes de usarlas
-- con un arriendo real hay que hacerlas revisar.

INSERT IGNORE INTO plantillas_contrato
  (codigo, nombre, marco_legal, aplica_a_tipos, version, estado, vigente_desde, variables, cuerpo)
VALUES
(
  'vivienda_urbana_v1',
  'Arrendamiento de vivienda urbana (Ley 820 de 2003)',
  'vivienda_urbana',
  JSON_ARRAY('apartamento','casa'),
  1,
  'vigente',
  '2026-01-01',
  JSON_ARRAY('arrendador','documento_arrendador','arrendatario','documento_arrendatario',
             'direccion','ciudad','canon','canon_letras','dia_pago','fecha_inicio','fecha_fin',
             'meses','incremento','garantia','ajustes'),
  'CONTRATO DE ARRENDAMIENTO DE VIVIENDA URBANA

Entre {{arrendador}}, identificado con {{documento_arrendador}}, quien en adelante se denominará EL ARRENDADOR, y {{arrendatario}}, identificado con {{documento_arrendatario}}, quien en adelante se denominará EL ARRENDATARIO, se celebra el presente contrato de arrendamiento de vivienda urbana, regido por la Ley 820 de 2003 y las siguientes cláusulas:

PRIMERA — OBJETO. EL ARRENDADOR entrega a EL ARRENDATARIO, a título de arrendamiento, el inmueble ubicado en {{direccion}}, de la ciudad de {{ciudad}}, destinado exclusivamente a vivienda.

SEGUNDA — CANON. El canon mensual es de {{canon}} ({{canon_letras}}), pagadero dentro de los primeros {{dia_pago}} días de cada mes. El pago se hace directamente a EL ARRENDADOR; la constancia del pago es el comprobante que EL ARRENDATARIO reporte y EL ARRENDADOR verifique.

TERCERA — SERVICIOS Y ADICIONALES. Además del canon, las partes acuerdan: {{ajustes}}. Los servicios públicos domiciliarios no incluidos expresamente corren por cuenta de EL ARRENDATARIO.

CUARTA — TÉRMINO. El término es de {{meses}} meses, contados desde {{fecha_inicio}} hasta {{fecha_fin}}. Se prorroga automáticamente por períodos iguales, conforme al artículo 6 de la Ley 820 de 2003, salvo aviso previo en los términos legales.

QUINTA — INCREMENTO. Vencidos cada doce meses de ejecución, el canon se incrementará en {{incremento}}. En ningún caso el reajuste podrá exceder el ciento por ciento del incremento del índice de precios al consumidor del año calendario inmediatamente anterior, conforme al artículo 20 de la Ley 820 de 2003.

SEXTA — GARANTÍA. Como garantía del cumplimiento se constituye: {{garantia}}. De conformidad con el artículo 16 de la Ley 820 de 2003, NO se exige depósito en dinero ni caución real para garantizar el cumplimiento de este contrato.

SÉPTIMA — OBLIGACIONES DE EL ARRENDADOR. Entregar el inmueble en buen estado, mantenerlo en condiciones de servir para el fin convenido y realizar las reparaciones necesarias, salvo las locativas.

OCTAVA — OBLIGACIONES DE EL ARRENDATARIO. Pagar el canon en la forma pactada, cuidar el inmueble, realizar las reparaciones locativas derivadas del uso, y restituirlo al terminar el contrato en el estado en que lo recibió, salvo el deterioro natural.

NOVENA — TERMINACIÓN. El contrato termina por las causales de los artículos 22 y 24 de la Ley 820 de 2003, y por mutuo acuerdo de las partes.

DÉCIMA — MORA. El retardo en el pago causa intereses de mora a la tasa máxima legal permitida, sin que ello constituya prórroga del plazo ni renuncia a las acciones que correspondan.

Las partes suscriben el presente contrato en señal de aceptación.'
),
(
  'comercial_v1',
  'Arrendamiento de local comercial',
  'comercial',
  JSON_ARRAY('local','oficina','bodega','lote'),
  1,
  'vigente',
  '2026-01-01',
  JSON_ARRAY('arrendador','documento_arrendador','arrendatario','documento_arrendatario',
             'direccion','ciudad','canon','canon_letras','dia_pago','fecha_inicio','fecha_fin',
             'meses','incremento','garantia','ajustes'),
  'CONTRATO DE ARRENDAMIENTO DE LOCAL COMERCIAL

Entre {{arrendador}}, identificado con {{documento_arrendador}}, EL ARRENDADOR, y {{arrendatario}}, identificado con {{documento_arrendatario}}, EL ARRENDATARIO, se celebra el presente contrato, regido por el Código de Comercio y el Código Civil, en las siguientes cláusulas:

PRIMERA — OBJETO. EL ARRENDADOR entrega en arrendamiento el inmueble ubicado en {{direccion}}, de la ciudad de {{ciudad}}, destinado al ejercicio de actividad mercantil.

SEGUNDA — CANON. El canon mensual es de {{canon}} ({{canon_letras}}), pagadero dentro de los primeros {{dia_pago}} días de cada mes.

TERCERA — ADICIONALES. Las partes acuerdan además: {{ajustes}}.

CUARTA — TÉRMINO. El término es de {{meses}} meses, desde {{fecha_inicio}} hasta {{fecha_fin}}. EL ARRENDATARIO que haya ocupado el inmueble con un mismo establecimiento de comercio por dos años consecutivos o más tendrá derecho a la renovación del contrato, conforme al artículo 518 del Código de Comercio.

QUINTA — INCREMENTO. El canon se reajustará anualmente en {{incremento}}. A diferencia de la vivienda urbana, aquí las partes pueden pactar libremente el reajuste.

SEXTA — GARANTÍA. Se constituye como garantía: {{garantia}}.

SÉPTIMA — CESIÓN Y SUBARRIENDO. EL ARRENDATARIO no podrá ceder el contrato ni subarrendar sin autorización expresa y escrita de EL ARRENDADOR, salvo el caso del artículo 523 del Código de Comercio.

OCTAVA — DESTINACIÓN. El inmueble se destinará únicamente a la actividad declarada. El cambio de destinación sin autorización es causal de terminación.

NOVENA — TERMINACIÓN. Por vencimiento del término sin renovación, por mutuo acuerdo, o por incumplimiento de cualquiera de las obligaciones aquí pactadas.

Las partes suscriben el presente contrato en señal de aceptación.'
),
(
  'habitacion_v1',
  'Arrendamiento de habitación',
  'habitacion',
  JSON_ARRAY('habitacion'),
  1,
  'vigente',
  '2026-01-01',
  JSON_ARRAY('arrendador','documento_arrendador','arrendatario','documento_arrendatario',
             'direccion','ciudad','canon','canon_letras','dia_pago','fecha_inicio','fecha_fin',
             'meses','incremento','garantia','ajustes'),
  'CONTRATO DE ARRENDAMIENTO DE HABITACIÓN

Entre {{arrendador}}, identificado con {{documento_arrendador}}, EL ARRENDADOR, y {{arrendatario}}, identificado con {{documento_arrendatario}}, EL ARRENDATARIO, se celebra el presente contrato de arrendamiento de vivienda compartida, regido por la Ley 820 de 2003 en lo pertinente:

PRIMERA — OBJETO. EL ARRENDADOR entrega en arrendamiento la habitación ubicada en {{direccion}}, de la ciudad de {{ciudad}}, junto con el uso compartido de las zonas comunes del inmueble.

SEGUNDA — CANON. El canon mensual es de {{canon}} ({{canon_letras}}), pagadero dentro de los primeros {{dia_pago}} días de cada mes, e incluye los servicios públicos salvo pacto en contrario.

TERCERA — ADICIONALES. Las partes acuerdan además: {{ajustes}}.

CUARTA — TÉRMINO. De {{meses}} meses, desde {{fecha_inicio}} hasta {{fecha_fin}}.

QUINTA — INCREMENTO. El canon se reajustará en {{incremento}}, sin exceder el índice de precios al consumidor del año anterior.

SEXTA — GARANTÍA. Se constituye: {{garantia}}. No se exige depósito en dinero.

SÉPTIMA — CONVIVENCIA. EL ARRENDATARIO se obliga a respetar el reglamento de convivencia del inmueble y el descanso de los demás ocupantes. El ingreso de personas ajenas requiere aviso previo a EL ARRENDADOR.

OCTAVA — ZONAS COMUNES. El uso de cocina, baños y zonas comunes es compartido. EL ARRENDATARIO responde por el aseo de la habitación y por el uso razonable de lo común.

NOVENA — TERMINACIÓN. Por vencimiento, mutuo acuerdo, o incumplimiento de las obligaciones de convivencia o de pago.

Las partes suscriben el presente contrato en señal de aceptación.'
),
(
  'parqueadero_v1',
  'Arrendamiento de parqueadero',
  'parqueadero',
  JSON_ARRAY('parqueadero'),
  1,
  'vigente',
  '2026-01-01',
  JSON_ARRAY('arrendador','documento_arrendador','arrendatario','documento_arrendatario',
             'direccion','ciudad','canon','canon_letras','dia_pago','fecha_inicio','fecha_fin',
             'meses','incremento','garantia','ajustes'),
  'CONTRATO DE ARRENDAMIENTO DE PARQUEADERO

Entre {{arrendador}}, identificado con {{documento_arrendador}}, EL ARRENDADOR, y {{arrendatario}}, identificado con {{documento_arrendatario}}, EL ARRENDATARIO, se celebra el presente contrato:

PRIMERA — OBJETO. EL ARRENDADOR entrega en arrendamiento el espacio de parqueo ubicado en {{direccion}}, de la ciudad de {{ciudad}}, destinado exclusivamente al estacionamiento de un vehículo.

SEGUNDA — CANON. El canon mensual es de {{canon}} ({{canon_letras}}), pagadero dentro de los primeros {{dia_pago}} días de cada mes.

TERCERA — ADICIONALES. Las partes acuerdan además: {{ajustes}}.

CUARTA — TÉRMINO. De {{meses}} meses, desde {{fecha_inicio}} hasta {{fecha_fin}}.

QUINTA — INCREMENTO. El canon se reajustará anualmente en {{incremento}}.

SEXTA — GARANTÍA. Se constituye: {{garantia}}.

SÉPTIMA — RESPONSABILIDAD. EL ARRENDADOR no asume la custodia ni la guarda del vehículo. Este contrato es de arrendamiento de espacio, no de depósito, y EL ARRENDADOR no responde por hurto ni daños al vehículo o a los bienes dejados en él.

OCTAVA — USO. El espacio no podrá destinarse a depósito de bienes, taller, ni a ninguna actividad distinta del estacionamiento.

NOVENA — TERMINACIÓN. Por vencimiento, mutuo acuerdo o incumplimiento.

Las partes suscriben el presente contrato en señal de aceptación.'
);

-- La plantilla que ya existía era un esbozo de 47 caracteres — el título y unos
-- puntos suspensivos. Se archiva en vez de borrarse: si algún contrato la
-- referencia, borrarla dejaría ese contrato apuntando a nada, y el contrato
-- guarda plantilla_id y versión justamente para poder reconstruir con qué texto
-- se firmó.
--
-- Que quedaran dos vigentes para vivienda urbana no era cosmético: `generar`
-- toma la primera que encuentra, así que el contrato salía con una u otra según
-- el orden que devolviera la base.
UPDATE plantillas_contrato
SET estado = 'archivada', vigente_hasta = '2025-12-31'
WHERE codigo = 'vivienda_820' AND estado = 'vigente';
